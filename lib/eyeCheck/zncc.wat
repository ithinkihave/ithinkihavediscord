;; Masked ZNCC scan kernel, WebAssembly SIMD (128-bit).
;;
;; Build: npm run build:wasm (wabt 1.0.37; SIMD is on by default). The
;; compiled zncc.wasm is committed so the bot needs no build step.
;;
;; The frame's luminance is stored as three column-phase planes so that eight
;; consecutive stride-3 windows read eight contiguous f32 values:
;;   plane[p][y][m] = lum[y][3m + p]      (p = 0..2, row length = rowStride)
;; A template pixel (dx, dy) therefore maps to the byte offset
;;   (((dx % 3) * planeRows + dy) * rowStride + floor(dx / 3)) * 4
;; relative to the window group's base, which the host precomputes per scale.
;;
;; Template entries are 12 bytes each: [offset: i32, weight: f32, deviation: f32].
;; For every window the kernel computes Σw·f, Σw·f², Σd·f, then
;;   varF = Σw·f² − (Σw·f)² / Σw ;  corr = Σd·f / (σT · sqrt(varF))
;; and appends windows with varF > minVariance and corr >= threshold to the
;; output as [windowRow: i32, windowCol: i32, corr: f32].
(module
	(memory (export "memory") 1)

	(func (export "scanTemplate")
		(param $planes i32) ;; byte address of plane 0, row 0, col 0
		(param $rowStride i32) ;; f32 elements per plane row
		(param $winRows i32) ;; number of window rows (y = 0, 3, 6, ...)
		(param $winCols i32) ;; number of window columns (x = 0, 3, 6, ...)
		(param $tpl i32) ;; byte address of template entries
		(param $count i32) ;; number of template entries
		(param $invWeightSum f32)
		(param $stdDev f32)
		(param $minVariance f32)
		(param $threshold f32)
		(param $out i32) ;; byte address of the output triplets
		(param $outCap i32) ;; max triplets
		(result i32) ;; triplets written (may exceed outCap: caller retries)

		(local $wy i32)
		(local $m i32)
		(local $base i32)
		(local $p i32)
		(local $end i32)
		(local $v0 v128)
		(local $v1 v128)
		(local $w v128)
		(local $d v128)
		(local $wv v128)
		(local $a0 v128)
		(local $b0 v128)
		(local $n0 v128)
		(local $a1 v128)
		(local $b1 v128)
		(local $n1 v128)
		(local $written i32)
		(local $rowBytes i32)
		(local $lane i32)
		(local $corr f32)
		(local $var f32)
		(local $tmpA f32)
		(local $tmpB f32)
		(local $tmpN f32)

		(local.set $end
			(i32.add (local.get $tpl) (i32.mul (local.get $count) (i32.const 12))))
		;; window rows advance 3 pixel rows; planes are row-major per phase
		(local.set $rowBytes (i32.mul (local.get $rowStride) (i32.const 12)))

		(local.set $wy (i32.const 0))
		(block $rowsDone
			(loop $rows
				(br_if $rowsDone (i32.ge_u (local.get $wy) (local.get $winRows)))
				(local.set $m (i32.const 0))
				(block $colsDone
					(loop $cols
						(br_if $colsDone (i32.ge_u (local.get $m) (local.get $winCols)))
						(local.set $base
							(i32.add (local.get $planes)
								(i32.add
									(i32.mul (local.get $wy) (local.get $rowBytes))
									(i32.shl (local.get $m) (i32.const 2)))))

						(local.set $a0 (v128.const i32x4 0 0 0 0))
						(local.set $b0 (v128.const i32x4 0 0 0 0))
						(local.set $n0 (v128.const i32x4 0 0 0 0))
						(local.set $a1 (v128.const i32x4 0 0 0 0))
						(local.set $b1 (v128.const i32x4 0 0 0 0))
						(local.set $n1 (v128.const i32x4 0 0 0 0))

						(local.set $p (local.get $tpl))
						(block $pixDone
							(loop $pix
								(br_if $pixDone (i32.ge_u (local.get $p) (local.get $end)))
								(local.set $v0
									(v128.load
										(i32.add (local.get $base) (i32.load (local.get $p)))))
								(local.set $v1
									(v128.load offset=16
										(i32.add (local.get $base) (i32.load (local.get $p)))))
								(local.set $w (v128.load32_splat offset=4 (local.get $p)))
								(local.set $d (v128.load32_splat offset=8 (local.get $p)))

								(local.set $wv (f32x4.mul (local.get $v0) (local.get $w)))
								(local.set $a0 (f32x4.add (local.get $a0) (local.get $wv)))
								(local.set $b0
									(f32x4.add (local.get $b0) (f32x4.mul (local.get $wv) (local.get $v0))))
								(local.set $n0
									(f32x4.add (local.get $n0) (f32x4.mul (local.get $v0) (local.get $d))))

								(local.set $wv (f32x4.mul (local.get $v1) (local.get $w)))
								(local.set $a1 (f32x4.add (local.get $a1) (local.get $wv)))
								(local.set $b1
									(f32x4.add (local.get $b1) (f32x4.mul (local.get $wv) (local.get $v1))))
								(local.set $n1
									(f32x4.add (local.get $n1) (f32x4.mul (local.get $v1) (local.get $d))))

								(local.set $p (i32.add (local.get $p) (i32.const 12)))
								(br $pix)))

						;; emit lanes 0..7 that pass (scalar epilogue; rare path is the write)
						(local.set $lane (i32.const 0))
						(block $lanesDone
							(loop $lanes
								(br_if $lanesDone (i32.ge_u (local.get $lane) (i32.const 8)))
								(br_if $lanesDone
									(i32.ge_u (i32.add (local.get $m) (local.get $lane)) (local.get $winCols)))
								(if (i32.lt_u (local.get $lane) (i32.const 4))
									(then
										(local.set $tmpA (call $lane4 (local.get $a0) (local.get $lane)))
										(local.set $tmpB (call $lane4 (local.get $b0) (local.get $lane)))
										(local.set $tmpN (call $lane4 (local.get $n0) (local.get $lane))))
									(else
										(local.set $tmpA
											(call $lane4 (local.get $a1) (i32.sub (local.get $lane) (i32.const 4))))
										(local.set $tmpB
											(call $lane4 (local.get $b1) (i32.sub (local.get $lane) (i32.const 4))))
										(local.set $tmpN
											(call $lane4 (local.get $n1) (i32.sub (local.get $lane) (i32.const 4))))))
								(local.set $var
									(f32.sub (local.get $tmpB)
										(f32.mul (f32.mul (local.get $tmpA) (local.get $tmpA))
											(local.get $invWeightSum))))
								(if (f32.gt (local.get $var) (local.get $minVariance))
									(then
										(local.set $corr
											(f32.div (local.get $tmpN)
												(f32.mul (local.get $stdDev) (f32.sqrt (local.get $var)))))
										(if (f32.ge (local.get $corr) (local.get $threshold))
											(then
												(if (i32.lt_u (local.get $written) (local.get $outCap))
													(then
														(i32.store
															(i32.add (local.get $out) (i32.mul (local.get $written) (i32.const 12)))
															(local.get $wy))
														(i32.store offset=4
															(i32.add (local.get $out) (i32.mul (local.get $written) (i32.const 12)))
															(i32.add (local.get $m) (local.get $lane)))
														(f32.store offset=8
															(i32.add (local.get $out) (i32.mul (local.get $written) (i32.const 12)))
															(local.get $corr))))
												(local.set $written (i32.add (local.get $written) (i32.const 1)))))))
								(local.set $lane (i32.add (local.get $lane) (i32.const 1)))
								(br $lanes)))

						(local.set $m (i32.add (local.get $m) (i32.const 8)))
						(br $cols)))
				(local.set $wy (i32.add (local.get $wy) (i32.const 1)))
				(br $rows)))
		(local.get $written))

	(func $lane4 (param $v v128) (param $i i32) (result f32)
		(if (result f32) (i32.eq (local.get $i) (i32.const 0))
			(then (f32x4.extract_lane 0 (local.get $v)))
			(else
				(if (result f32) (i32.eq (local.get $i) (i32.const 1))
					(then (f32x4.extract_lane 1 (local.get $v)))
					(else
						(if (result f32) (i32.eq (local.get $i) (i32.const 2))
							(then (f32x4.extract_lane 2 (local.get $v)))
							(else (f32x4.extract_lane 3 (local.get $v)))))))))
)

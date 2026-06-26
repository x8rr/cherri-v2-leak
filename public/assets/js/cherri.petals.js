if ((localStorage.getItem("cherri_usePetals") || "yes") === "yes") {
	(function () {
				TweenLite.set("#falling-petals", { perspective: 600 });
		TweenLite.set("img", { xPercent: "-5%", yPercent: "-5%" });

		var total = 23;
		var warp = document.getElementById("falling-petals"),
			w = window.innerWidth,
			h = window.innerHeight;

		for (i = 0; i < total; i++) {
			var Div = document.createElement("div");
			TweenLite.set(Div, {
				attr: { class: "dot" },
				x: R(0, w),
				y: R(-200, -150),
				z: R(-200, 200),
			});
			warp.appendChild(Div);
			animm(Div);
		}

		function animm(elm) {
			TweenMax.to(elm, R(6, 15), {
				y: h + 100,
				ease: Linear.easeNone,
				repeat: -1,
				delay: -15,
			});
			TweenMax.to(elm, R(4, 8), {
				x: "+=100",
				rotationZ: R(0, 180),
				repeat: -1,
				yoyo: true,
				ease: Sine.easeInOut,
			});
			TweenMax.to(elm, R(2, 8), {
				rotationX: R(0, 90),
				rotationY: R(0, 90),
				repeat: -1,
				yoyo: true,
				ease: Sine.easeInOut,
				delay: -5,
			});
		}

		function R(min, max) {
			return min + Math.random() * (max - min);
		}

		
	})();
}
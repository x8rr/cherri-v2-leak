if ((localStorage.getItem("cherri_disabledFools") || "no") === "no") {
	document.querySelectorAll("*").forEach((el) => {
		if (Math.random() < 0.1) el.style.filter = "invert(1)";
		el.addEventListener("click", () => {
			if (Math.random() < 0.1) {
				el.style.position = "fixed";
				window.addEventListener("mousemove", (e) => {
					el.style.left = e.clientX + "px";
					el.style.top = e.clientY + "px";
				});
			}
		});
	});

	window.addEventListener("click", () => {
		if (Math.random() < 0.01) {
			window.open("https://google.com/");
		}
	});

	let ctx;
	function getCtx() {
		if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
		if (ctx.state === "suspended") ctx.resume();
		return ctx;
	}

	const soundFns = [
		function fart() {
			const c = getCtx(),
				t = c.currentTime;
			const osc = c.createOscillator();
			const gain = c.createGain();
			const lfo = c.createOscillator();
			const lfoGain = c.createGain();
			lfo.frequency.value = 30;
			lfoGain.gain.value = 80;
			lfo.connect(lfoGain);
			lfoGain.connect(osc.frequency);
			osc.type = "sawtooth";
			osc.frequency.setValueAtTime(120, t);
			osc.frequency.exponentialRampToValueAtTime(60, t + 0.4);
			gain.gain.setValueAtTime(0.4, t);
			gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
			osc.connect(gain);
			gain.connect(c.destination);
			lfo.start(t);
			osc.start(t);
			lfo.stop(t + 0.45);
			osc.stop(t + 0.45);
		},
		function sadTrombone() {
			const c = getCtx(),
				t = c.currentTime;
			const notes = [466, 415, 370, 311];
			notes.forEach((freq, i) => {
				const osc = c.createOscillator();
				const gain = c.createGain();
				osc.type = "sawtooth";
				osc.frequency.value = freq;
				gain.gain.setValueAtTime(0, t + i * 0.18);
				gain.gain.linearRampToValueAtTime(0.25, t + i * 0.18 + 0.05);
				gain.gain.setValueAtTime(0.25, t + i * 0.18 + 0.13);
				gain.gain.linearRampToValueAtTime(0, t + i * 0.18 + 0.18);
				osc.connect(gain);
				gain.connect(c.destination);
				osc.start(t + i * 0.18);
				osc.stop(t + i * 0.18 + 0.2);
			});
		},
		function airhorn() {
			const c = getCtx(),
				t = c.currentTime;
			const osc = c.createOscillator();
			const osc2 = c.createOscillator();
			const gain = c.createGain();
			osc.type = "sawtooth";
			osc.frequency.value = 233;
			osc2.type = "sawtooth";
			osc2.frequency.value = 350;
			gain.gain.setValueAtTime(0.3, t);
			gain.gain.setValueAtTime(0.3, t + 0.5);
			gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
			osc.connect(gain);
			osc2.connect(gain);
			gain.connect(c.destination);
			osc.start(t);
			osc2.start(t);
			osc.stop(t + 0.7);
			osc2.stop(t + 0.7);
		},
		function meow() {
			const c = getCtx(),
				t = c.currentTime;
			const osc = c.createOscillator();
			const gain = c.createGain();
			osc.type = "sine";
			osc.frequency.setValueAtTime(600, t);
			osc.frequency.linearRampToValueAtTime(900, t + 0.1);
			osc.frequency.linearRampToValueAtTime(700, t + 0.3);
			gain.gain.setValueAtTime(0, t);
			gain.gain.linearRampToValueAtTime(0.3, t + 0.05);
			gain.gain.setValueAtTime(0.3, t + 0.25);
			gain.gain.linearRampToValueAtTime(0, t + 0.4);
			osc.connect(gain);
			gain.connect(c.destination);
			osc.start(t);
			osc.stop(t + 0.4);
		},
		function cashRegister() {
			const c = getCtx(),
				t = c.currentTime;
			[1200, 1600, 2000].forEach((f, i) => {
				const osc = c.createOscillator();
				const gain = c.createGain();
				osc.frequency.value = f;
				gain.gain.setValueAtTime(0.2, t + i * 0.06);
				gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.1);
				osc.connect(gain);
				gain.connect(c.destination);
				osc.start(t + i * 0.06);
				osc.stop(t + i * 0.06 + 0.12);
			});
		},
		function boing() {
			const c = getCtx(),
				t = c.currentTime;
			const osc = c.createOscillator();
			const gain = c.createGain();
			osc.type = "sine";
			osc.frequency.setValueAtTime(80, t);
			osc.frequency.exponentialRampToValueAtTime(1200, t + 0.3);
			gain.gain.setValueAtTime(0.4, t);
			gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
			osc.connect(gain);
			gain.connect(c.destination);
			osc.start(t);
			osc.stop(t + 0.35);
		},
		function laugh() {
			const c = getCtx(),
				t = c.currentTime;
			for (let i = 0; i < 5; i++) {
				const osc = c.createOscillator();
				const gain = c.createGain();
				osc.type = "sine";
				osc.frequency.value = 400 + Math.random() * 200;
				const s = t + i * 0.1;
				gain.gain.setValueAtTime(0, s);
				gain.gain.linearRampToValueAtTime(0.25, s + 0.03);
				gain.gain.exponentialRampToValueAtTime(0.001, s + 0.09);
				osc.connect(gain);
				gain.connect(c.destination);
				osc.start(s);
				osc.stop(s + 0.1);
			}
		},
		function crickets() {
			const c = getCtx(),
				t = c.currentTime;
			for (let i = 0; i < 3; i++) {
				const osc = c.createOscillator();
				const gain = c.createGain();
				osc.frequency.value = 3800 + i * 200;
				gain.gain.setValueAtTime(0, t + i * 0.2);
				gain.gain.linearRampToValueAtTime(0.08, t + i * 0.2 + 0.05);
				gain.gain.linearRampToValueAtTime(0, t + i * 0.2 + 0.15);
				osc.connect(gain);
				gain.connect(c.destination);
				osc.start(t + i * 0.2);
				osc.stop(t + i * 0.2 + 0.2);
			}
		},
	];
	let totalKeys = 0,
		soundsPlayed = 0;

	const keycode = [
		"arrowup",
		"arrowup",
		"arrowdown",
		"arrowdown",
		"arrowleft",
		"arrowright",
		"arrowleft",
		"arrowright",
		"b",
		"a",
		"enter",
	];
	let keyIndex = 0;

	window.addEventListener("keydown", (e) => {
		console.log(e.key);
		console.log(keyIndex);
		if (e.key.toLowerCase() === keycode[keyIndex]) {
			keyIndex++;
			console.log(keyIndex);
			if (keyIndex === keycode.length) {
				keyIndex = 0;
				localStorage.setItem("cherri_disabledFools", "yes");
				window.top.location.reload();
			}
		} else {
			keyIndex = 0;
		}
		if (e.key.length !== 1 && e.key !== "Backspace" && e.key !== "Enter")
			return;
		totalKeys++;
		if (Math.random() < 0.15) {
			soundsPlayed++;
			soundFns[Math.floor(Math.random() * soundFns.length)]();
		}
	});
} else {
    document.getElementById("huewheeloverlay").remove()
}
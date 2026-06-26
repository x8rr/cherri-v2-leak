const links = document.querySelectorAll("nav ul li");
const frame = document.getElementById("contentframe");
const PAGE_VERSION = "20260618a";
let collapsed = false;
const nav = document.querySelector("nav");
const flap = document.getElementById("collapse-flap");
let hasloaded = true;
const loadingContainer = document.querySelector(".loadingspinner");
const windowLayer = document.getElementById("window-layer");
let topWindowZ = 80;

function page(p) {
	frame.style.opacity = 0;
	frame.style.scale = 0.98;
	hasloaded = false;
	setTimeout(() => {
		frame.src = `/pages/${p}.html?v=${PAGE_VERSION}`;
	}, 200);
	setTimeout(() => {
		if (hasloaded === false) {
			loadingContainer.style.opacity = "1";
		}
	}, 600);
	frame.addEventListener("load", () => {
		setTimeout(() => {
			hasloaded = true;
			loadingContainer.style.opacity = "0";
			frame.style.opacity = 1;
			frame.style.scale = 1;
		}, 0);
	});
	links.forEach((l) => {
		l.classList.remove("active");
		if (l.dataset.target === p) {
			l.classList.add("active");
		}
	});
}

function getPageUrl(target) {
	return `/pages/${target}.html?v=${PAGE_VERSION}`;
}

function focusAppWindow(appWindow) {
	if (!appWindow) return;
	topWindowZ += 1;
	appWindow.style.zIndex = topWindowZ;
}

function setInteractionShield(appWindow, active) {
	const shield = appWindow?.querySelector(".app-window-shield");
	if (!shield) return;
	shield.classList.toggle("active", active);
}

function makeDraggable(appWindow, handle) {
	let startX = 0;
	let startY = 0;
	let startLeft = 0;
	let startTop = 0;
	let dragging = false;

	const onMove = (event) => {
		if (!dragging) return;
		const nextLeft = startLeft + (event.clientX - startX);
		const nextTop = startTop + (event.clientY - startY);
		const maxLeft = Math.max(0, window.innerWidth - appWindow.offsetWidth);
		const maxTop = Math.max(0, window.innerHeight - appWindow.offsetHeight);
		appWindow.style.left = `${Math.min(Math.max(0, nextLeft), maxLeft)}px`;
		appWindow.style.top = `${Math.min(Math.max(0, nextTop), maxTop)}px`;
	};

	const onUp = () => {
		dragging = false;
		appWindow.classList.remove("dragging");
		setInteractionShield(appWindow, false);
		document.removeEventListener("pointermove", onMove);
		document.removeEventListener("pointerup", onUp);
	};

	handle.addEventListener("pointerdown", (event) => {
		if (event.target.closest("button")) return;
		dragging = true;
		startX = event.clientX;
		startY = event.clientY;
		startLeft = appWindow.offsetLeft;
		startTop = appWindow.offsetTop;
		focusAppWindow(appWindow);
		appWindow.classList.add("dragging");
		setInteractionShield(appWindow, true);
		document.addEventListener("pointermove", onMove);
		document.addEventListener("pointerup", onUp);
	});
}

function makeResizable(appWindow) {
	const directions = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
	const minWidth = parseFloat(getComputedStyle(appWindow).minWidth) || 320;
	const minHeight = parseFloat(getComputedStyle(appWindow).minHeight) || 240;

	directions.forEach((direction) => {
		const handle = document.createElement("div");
		handle.className = "app-window-resize";
		handle.dataset.direction = direction;
		appWindow.appendChild(handle);

		handle.addEventListener("pointerdown", (event) => {
			event.preventDefault();
			event.stopPropagation();
			focusAppWindow(appWindow);

			const startX = event.clientX;
			const startY = event.clientY;
			const startWidth = appWindow.offsetWidth;
			const startHeight = appWindow.offsetHeight;
			const startLeft = appWindow.offsetLeft;
			const startTop = appWindow.offsetTop;

			appWindow.classList.add("resizing");
			setInteractionShield(appWindow, true);

			const onMove = (moveEvent) => {
				const deltaX = moveEvent.clientX - startX;
				const deltaY = moveEvent.clientY - startY;
				let nextWidth = startWidth;
				let nextHeight = startHeight;
				let nextLeft = startLeft;
				let nextTop = startTop;

				if (direction.includes("e")) {
					nextWidth = Math.max(minWidth, startWidth + deltaX);
				}

				if (direction.includes("s")) {
					nextHeight = Math.max(minHeight, startHeight + deltaY);
				}

				if (direction.includes("w")) {
					const proposedWidth = startWidth - deltaX;
					nextWidth = Math.max(minWidth, proposedWidth);
					nextLeft = startLeft + (startWidth - nextWidth);
				}

				if (direction.includes("n")) {
					const proposedHeight = startHeight - deltaY;
					nextHeight = Math.max(minHeight, proposedHeight);
					nextTop = startTop + (startHeight - nextHeight);
				}

				const maxWidth = window.innerWidth - nextLeft;
				const maxHeight = window.innerHeight - nextTop;

				if (nextLeft < 0) {
					nextWidth += nextLeft;
					nextLeft = 0;
				}

				if (nextTop < 0) {
					nextHeight += nextTop;
					nextTop = 0;
				}

				nextWidth = Math.max(minWidth, Math.min(nextWidth, maxWidth));
				nextHeight = Math.max(minHeight, Math.min(nextHeight, maxHeight));

				appWindow.style.width = `${nextWidth}px`;
				appWindow.style.height = `${nextHeight}px`;
				appWindow.style.left = `${nextLeft}px`;
				appWindow.style.top = `${nextTop}px`;
			};

			const onUp = () => {
				appWindow.classList.remove("resizing");
				setInteractionShield(appWindow, false);
				document.removeEventListener("pointermove", onMove);
				document.removeEventListener("pointerup", onUp);
			};

			document.addEventListener("pointermove", onMove);
			document.addEventListener("pointerup", onUp);
		});
	});
}

function openAppPopup(target, label) {
	if (!windowLayer) {
		page(target);
		return;
	}

	const appWindow = document.createElement("section");
	appWindow.className = "app-window";
	appWindow.dataset.target = target;
	appWindow.style.left = `${Math.max(12, 110 + document.querySelectorAll(".app-window").length * 28)}px`;
	appWindow.style.top = `${Math.max(12, 72 + document.querySelectorAll(".app-window").length * 24)}px`;

	const bar = document.createElement("div");
	bar.className = "app-window-bar";
	bar.innerHTML = `
		<div class="app-window-title">
			<strong>${label}</strong>
		</div>
		<div class="app-window-controls">
			<button type="button" title="Reload"><i class="far fa-rotate-right"></i></button>
			<button type="button" title="Close"><i class="far fa-xmark"></i></button>
		</div>
	`;

	const popupFrame = document.createElement("iframe");
	popupFrame.src = getPageUrl(target);
	popupFrame.title = label;
	popupFrame.loading = "eager";

	const shield = document.createElement("div");
	shield.className = "app-window-shield";

	const [reloadButton, closeButton] = bar.querySelectorAll("button");
	reloadButton.addEventListener("click", () => {
		popupFrame.src = getPageUrl(target);
	});
	closeButton.addEventListener("click", () => {
		appWindow.remove();
	});

	appWindow.appendChild(bar);
	appWindow.appendChild(popupFrame);
	appWindow.appendChild(shield);
	appWindow.addEventListener("pointerdown", () => focusAppWindow(appWindow));
	windowLayer.appendChild(appWindow);
	focusAppWindow(appWindow);
	makeDraggable(appWindow, bar);
	makeResizable(appWindow);
}

function collapseNav() {
	if (collapsed) {
		nav.style.left = "10px";
		flap.style.display = "none";
		collapsed = false;
		frame.style.width = "calc(100vw - 80px)";
	} else {
		nav.style.left = "-100px";
		flap.style.display = "block";
		collapsed = true;
		frame.style.width = "100vw";
	}
}

frame.addEventListener("load", () => {
	if (frame.src.includes("/pages/play.html")) {
		return;
	}
});

flap.addEventListener("click", () => {
	collapseNav();
});

const params = new URLSearchParams(window.location.search);
if (params.get("page")) {
	page(params.get("page"));
}

if (window.screen.width <= 550) {
	collapseNav();
}

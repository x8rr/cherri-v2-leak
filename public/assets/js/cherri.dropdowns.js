function toggleDropdown(container) {
	const c = document.querySelector(`.${container}`);
	console.log(c);
	const itemc = c.querySelector("#d-item-list");
	const items = itemc.querySelectorAll("div");
	items.forEach((i) => {
		i.addEventListener("click", () => {
			c.querySelector("#d-selected-item").querySelector("span").textContent =
				i.textContent;
			toggleDropdown(`${container}`);
		});
	});
	if (itemc.classList.contains("active")) {
		itemc.classList.remove("active");
		document.querySelector(".bluroverlay").remove();
	} else {
		itemc.classList.add("active");
		const overlay = document.createElement("div");
		overlay.classList.add("bluroverlay");
		overlay.setAttribute("onclick", `toggleDropdown('${container}')`);
		document.body.appendChild(overlay);
	}
}

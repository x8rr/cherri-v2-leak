function createContainer(type) {
	if (type === "toast") {
		const newContainer = document.createElement("div");
		newContainer.id = "toastcontainer";
		return newContainer;
	}
}

function toast(icon, msg) {
	let toastContainer;
	if (!document.querySelector("#toastcontainer")) {
		toastContainer = createContainer("toast");
		document.body.appendChild(toastContainer);
	} else {
		toastContainer = document.querySelector("#toastcontainer");
	}

	const toast = document.createElement("div");
	toast.classList.add("toast");
	toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${msg}</span>
    `;
	toastContainer.appendChild(toast);
	setTimeout(() => {
		toast.style.right = "0";
	}, 100);
	setTimeout(() => {
		toast.style.right = "-110%";
	}, 4000);
	setTimeout(() => {
		toast.remove();
	}, 4301);
}

(function () {
	var obfuscationEnabled = true;
	var mappingUrl =
		window.__OB_FONT_MAPPING__ || "/assets/json/config/ob-mapping.json";
	var encodeMap = null;
	var decodeMap = null;
	var inited = false;

	function applyMapping(data) {
		if (!data || typeof data !== "object") return;
		var enc = data.encode || {};
		var dec = data.decode || {};
		encodeMap = {};
		decodeMap = {};
		for (var k in enc) encodeMap[parseInt(k, 10)] = enc[k];
		for (var k in dec) decodeMap[parseInt(k, 10)] = dec[k];
	}

	function encode(str) {
		if (!obfuscationEnabled || !encodeMap || typeof str !== "string")
			return str;
		var out = [];
		for (var i = 0; i < str.length; ) {
			var c = str.codePointAt(i);
			if (c === 32) {
				out.push(" ");
			} else {
				out.push(
					encodeMap[c] !== undefined
						? String.fromCodePoint(encodeMap[c])
						: c > 0xffff
							? str[i] + str[i + 1]
							: str[i],
				);
			}
			i += c > 0xffff ? 2 : 1;
		}
		return out.join("");
	}

	function decode(str) {
		if (!decodeMap || typeof str !== "string") return str;
		var out = [];
		for (var i = 0; i < str.length; ) {
			var c = str.codePointAt(i);
			out.push(
				decodeMap[c] !== undefined
					? String.fromCodePoint(decodeMap[c])
					: c > 0xffff
						? str[i] + str[i + 1]
						: str[i],
			);
			i += c > 0xffff ? 2 : 1;
		}
		return out.join("");
	}

	function isInsideSkipElement(node) {
		var n = node;
		while (n) {
			if (n.nodeType === 1) {
				var tag = n.tagName;
				if (
					tag === "SCRIPT" ||
					tag === "STYLE" ||
					tag === "NOSCRIPT" ||
					tag === "TEMPLATE"
				)
					return true;
				if (n.classList && n.classList.contains("no-obfuscate"))
					return true;
			}
			n = n.parentNode;
		}
		return false;
	}

	function processTextNodes(root) {
		if (!encodeMap) return;
		var inputs = root.querySelectorAll("input, textarea");
		for (var i = 0; i < inputs.length; i++) {
			var el = inputs[i];
			if (el.classList.contains("no-obfuscate")) continue;

			if (!el.hasAttribute("data-ob-done")) {
				if (el.value) el.value = encode(el.value);
				if (el.placeholder) el.placeholder = encode(el.placeholder);
				el.setAttribute("data-ob-done", "true");
			}
		}
		var walker = document.createTreeWalker(
			root,
			NodeFilter.SHOW_TEXT,
			null,
			false,
		);
		var node;
		var nodesToProcess = [];
		while ((node = walker.nextNode())) {
			if (!isInsideSkipElement(node) && node.data.trim().length > 0) {
				if (!node.parentNode.hasAttribute("data-ob-done")) {
					nodesToProcess.push(node);
				}
			}
		}
		for (var j = 0; j < nodesToProcess.length; j++) {
			nodesToProcess[j].data = encode(nodesToProcess[j].data);
			nodesToProcess[j].parentNode.setAttribute("data-ob-done", "true");
		}
	}

	document.addEventListener("copy", function (e) {
		if (!decodeMap) return;
		var sel = window.getSelection();
		var text = sel.rangeCount ? sel.toString() : "";

		if (
			!text &&
			(document.activeElement.tagName === "INPUT" ||
				document.activeElement.tagName === "TEXTAREA")
		) {
			var el = document.activeElement;
			text = el.value.substring(el.selectionStart, el.selectionEnd);
		}

		if (!text) return;
		e.clipboardData.setData("text/plain", decode(text));
		e.preventDefault();
	});

	function init() {
		if (!obfuscationEnabled || !encodeMap || inited || !document.body) return;
		inited = true;
		var containers = document.querySelectorAll(".obfuscate");
		for (var i = 0; i < containers.length; i++) {
			processTextNodes(containers[i]);
		}

		document.body.classList.add("obfuscated-ready");
	}

	window.obfuscateElement = function (el) {
		if (!encodeMap || !el) return;
		processTextNodes(el);
	};

	window.obfuscateText = function (str) {
		return encode(str);
	};

	fetch(mappingUrl)
		.then(function (r) {
			return r.ok ? r.json() : Promise.reject();
		})
		.then(function (data) {
			applyMapping(data);
			if (document.readyState === "loading") {
				document.addEventListener("DOMContentLoaded", init);
			} else {
				init();
			}
		})
		.catch(function () {});
})();

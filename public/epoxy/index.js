(function (g, f) {
	if (typeof exports == "object" && typeof module < "u") {
		module.exports = f(require);
	} else if ("function" == typeof define && define.amd) {
		define("EpxMod", ["fs", "ws", "path"], function (_d_0, _d_1, _d_2) {
			var d = { fs: _d_0, ws: _d_1, path: _d_2 },
				r = function (m) {
					if (m in d) return d[m];
					if (typeof require == "function") return require(m);
					throw new Error("Cannot find module '" + m + "'");
				};
			return f(r);
		});
	} else {
		var gN = { fs: "fs", ws: "ws", path: "path" },
			gReq = function (r) {
				var mod = r in gN ? g[gN[r]] : g[r];
				return mod;
			};
		g["EpxMod"] = f(gReq);
	}
})(
	typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : this,
	function (require) {
		var exports = {};
		var __exports = exports;
		var module = { exports };
		("use strict");
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
			for (var name in all)
				__defProp(target, name, { get: all[name], enumerable: true });
		};
		var __copyProps = (to, from, except, desc) => {
			if ((from && typeof from === "object") || typeof from === "function") {
				for (let key of __getOwnPropNames(from))
					if (!__hasOwnProp.call(to, key) && key !== except)
						__defProp(to, key, {
							get: () => from[key],
							enumerable:
								!(desc = __getOwnPropDesc(from, key)) ||
								desc.enumerable,
						});
			}
			return to;
		};
		var __toCommonJS = (mod) =>
			__copyProps(__defProp({}, "__esModule", { value: true }), mod);

		
		var main_exports = {};
		__export(main_exports, {
			default: () => EpoxyTransport,
			epoxyInfo: () => info,
		});
		module.exports = __toCommonJS(main_exports);

		
		var import_meta = {};
		function object_get(obj, k) {
			try {
				return obj[k];
			} catch (x) {
				return void 0;
			}
		}
		function object_set(obj, k, v) {
			try {
				obj[k] = v;
			} catch {}
		}
		async function convert_body_inner(body) {
			let req = new Request("", { method: "POST", duplex: "half", body });
			let type = req.headers.get("content-type");
			return [new Uint8Array(await req.arrayBuffer()), type];
		}
		function entries_of_object_inner(obj) {
			return Object.entries(obj).map((x) => x.map(String));
		}
		function define_property(obj, k, v) {
			Object.defineProperty(obj, k, { value: v, writable: false });
		}
		function ws_key() {
			let key = new Uint8Array(16);
			crypto.getRandomValues(key);
			return btoa(String.fromCharCode.apply(null, key));
		}
		function ws_protocol() {
			return ("10000000-1000-4000-8000" + -1e11).replace(/[018]/g, (c) =>
				(
					c ^
					(crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
				).toString(16),
			);
		}
		function from_entries(entries) {
			var ret = {};
			for (var i = 0; i < entries.length; i++)
				ret[entries[i][0]] = entries[i][1];
			return ret;
		}
		var wasm;
		var WASM_VECTOR_LEN = 0;
		var cachedUint8ArrayMemory0 = null;
		function getUint8ArrayMemory0() {
			if (
				cachedUint8ArrayMemory0 === null ||
				cachedUint8ArrayMemory0.byteLength === 0
			) {
				cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
			}
			return cachedUint8ArrayMemory0;
		}
		var cachedTextEncoder =
			typeof TextEncoder !== "undefined"
				? new TextEncoder("utf-8")
				: {
						encode: () => {
							throw Error("TextEncoder not available");
						},
					};
		var encodeString =
			typeof cachedTextEncoder.encodeInto === "function"
				? function (arg, view) {
						return cachedTextEncoder.encodeInto(arg, view);
					}
				: function (arg, view) {
						const buf = cachedTextEncoder.encode(arg);
						view.set(buf);
						return {
							read: arg.length,
							written: buf.length,
						};
					};
		function passStringToWasm0(arg, malloc, realloc) {
			if (realloc === void 0) {
				const buf = cachedTextEncoder.encode(arg);
				const ptr2 = malloc(buf.length, 1) >>> 0;
				getUint8ArrayMemory0()
					.subarray(ptr2, ptr2 + buf.length)
					.set(buf);
				WASM_VECTOR_LEN = buf.length;
				return ptr2;
			}
			let len = arg.length;
			let ptr = malloc(len, 1) >>> 0;
			const mem = getUint8ArrayMemory0();
			let offset = 0;
			for (; offset < len; offset++) {
				const code = arg.charCodeAt(offset);
				if (code > 127) break;
				mem[ptr + offset] = code;
			}
			if (offset !== len) {
				if (offset !== 0) {
					arg = arg.slice(offset);
				}
				ptr = realloc(ptr, len, (len = offset + arg.length * 3), 1) >>> 0;
				const view = getUint8ArrayMemory0().subarray(
					ptr + offset,
					ptr + len,
				);
				const ret = encodeString(arg, view);
				offset += ret.written;
				ptr = realloc(ptr, len, offset, 1) >>> 0;
			}
			WASM_VECTOR_LEN = offset;
			return ptr;
		}
		function isLikeNone(x) {
			return x === void 0 || x === null;
		}
		var cachedDataViewMemory0 = null;
		function getDataViewMemory0() {
			if (
				cachedDataViewMemory0 === null ||
				cachedDataViewMemory0.buffer.detached === true ||
				(cachedDataViewMemory0.buffer.detached === void 0 &&
					cachedDataViewMemory0.buffer !== wasm.memory.buffer)
			) {
				cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
			}
			return cachedDataViewMemory0;
		}
		var cachedTextDecoder =
			typeof TextDecoder !== "undefined"
				? new TextDecoder("utf-8", { ignoreBOM: true, fatal: true })
				: {
						decode: () => {
							throw Error("TextDecoder not available");
						},
					};
		if (typeof TextDecoder !== "undefined") {
			cachedTextDecoder.decode();
		}
		function getStringFromWasm0(ptr, len) {
			ptr = ptr >>> 0;
			return cachedTextDecoder.decode(
				getUint8ArrayMemory0().subarray(ptr, ptr + len),
			);
		}
		function debugString(val) {
			const type = typeof val;
			if (type == "number" || type == "boolean" || val == null) {
				return `${val}`;
			}
			if (type == "string") {
				return `"${val}"`;
			}
			if (type == "symbol") {
				const description = val.description;
				if (description == null) {
					return "Symbol";
				} else {
					return `Symbol(${description})`;
				}
			}
			if (type == "function") {
				const name = val.name;
				if (typeof name == "string" && name.length > 0) {
					return `Function(${name})`;
				} else {
					return "Function";
				}
			}
			if (Array.isArray(val)) {
				const length = val.length;
				let debug = "[";
				if (length > 0) {
					debug += debugString(val[0]);
				}
				for (let i = 1; i < length; i++) {
					debug += ", " + debugString(val[i]);
				}
				debug += "]";
				return debug;
			}
			const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
			let className;
			if (builtInMatches.length > 1) {
				className = builtInMatches[1];
			} else {
				return toString.call(val);
			}
			if (className == "Object") {
				try {
					return "Object(" + JSON.stringify(val) + ")";
				} catch (_) {
					return "Object";
				}
			}
			if (val instanceof Error) {
				return `${val.name}: ${val.message}
${val.stack}`;
			}
			return className;
		}
		var CLOSURE_DTORS =
			typeof FinalizationRegistry === "undefined"
				? { register: () => {}, unregister: () => {} }
				: new FinalizationRegistry((state) => {
						wasm.__wbindgen_export_3.get(state.dtor)(state.a, state.b);
					});
		function makeClosure(arg0, arg1, dtor, f) {
			const state = { a: arg0, b: arg1, cnt: 1, dtor };
			const real = (...args) => {
				state.cnt++;
				try {
					return f(state.a, state.b, ...args);
				} finally {
					if (--state.cnt === 0) {
						wasm.__wbindgen_export_3.get(state.dtor)(state.a, state.b);
						state.a = 0;
						CLOSURE_DTORS.unregister(state);
					}
				}
			};
			real.original = state;
			CLOSURE_DTORS.register(real, state, state);
			return real;
		}
		function __wbg_adapter_34(arg0, arg1, arg2) {
			wasm.closure17_externref_shim(arg0, arg1, arg2);
		}
		function __wbg_adapter_37(arg0, arg1) {
			wasm._dyn_core__ops__function__Fn_____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h30c4fbf9348c8688(
				arg0,
				arg1,
			);
		}
		function makeMutClosure(arg0, arg1, dtor, f) {
			const state = { a: arg0, b: arg1, cnt: 1, dtor };
			const real = (...args) => {
				state.cnt++;
				const a = state.a;
				state.a = 0;
				try {
					return f(a, state.b, ...args);
				} finally {
					if (--state.cnt === 0) {
						wasm.__wbindgen_export_3.get(state.dtor)(a, state.b);
						CLOSURE_DTORS.unregister(state);
					} else {
						state.a = a;
					}
				}
			};
			real.original = state;
			CLOSURE_DTORS.register(real, state, state);
			return real;
		}
		function __wbg_adapter_42(arg0, arg1, arg2) {
			wasm.closure201_externref_shim(arg0, arg1, arg2);
		}
		function __wbg_adapter_45(arg0, arg1) {
			wasm._dyn_core__ops__function__FnMut_____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h3df7d1ebff011046(
				arg0,
				arg1,
			);
		}
		function addToExternrefTable0(obj) {
			const idx = wasm.__externref_table_alloc();
			wasm.__wbindgen_export_2.set(idx, obj);
			return idx;
		}
		function handleError(f, args) {
			try {
				return f.apply(this, args);
			} catch (e) {
				const idx = addToExternrefTable0(e);
				wasm.__wbindgen_exn_store(idx);
			}
		}
		function passArrayJsValueToWasm0(array, malloc) {
			const ptr = malloc(array.length * 4, 4) >>> 0;
			const mem = getDataViewMemory0();
			for (let i = 0; i < array.length; i++) {
				mem.setUint32(ptr + 4 * i, addToExternrefTable0(array[i]), true);
			}
			WASM_VECTOR_LEN = array.length;
			return ptr;
		}
		function getArrayJsValueFromWasm0(ptr, len) {
			ptr = ptr >>> 0;
			const mem = getDataViewMemory0();
			const result = [];
			for (let i = ptr; i < ptr + 4 * len; i += 4) {
				result.push(wasm.__wbindgen_export_2.get(mem.getUint32(i, true)));
			}
			wasm.__externref_drop_slice(ptr, len);
			return result;
		}
		function _assertClass(instance, klass) {
			if (!(instance instanceof klass)) {
				throw new Error(`expected instance of ${klass.name}`);
			}
			return instance.ptr;
		}
		function takeFromExternrefTable0(idx) {
			const value = wasm.__wbindgen_export_2.get(idx);
			wasm.__externref_table_dealloc(idx);
			return value;
		}
		function __wbg_adapter_169(arg0, arg1, arg2, arg3) {
			wasm.closure140_externref_shim(arg0, arg1, arg2, arg3);
		}
		function notDefined(what) {
			return () => {
				throw new Error(`${what} is not defined`);
			};
		}
		function getArrayU8FromWasm0(ptr, len) {
			ptr = ptr >>> 0;
			return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
		}
		var __wbindgen_enum_BinaryType = ["blob", "arraybuffer"];
		var EpoxyClientFinalization =
			typeof FinalizationRegistry === "undefined"
				? { register: () => {}, unregister: () => {} }
				: new FinalizationRegistry((ptr) =>
						wasm.__wbg_epoxyclient_free(ptr >>> 0, 1),
					);
		var EpoxyClient = class {
			toJSON() {
				return {
					redirect_limit: this.redirect_limit,
					user_agent: this.user_agent,
					buffer_size: this.buffer_size,
				};
			}
			toString() {
				return JSON.stringify(this);
			}
			__destroy_into_raw() {
				const ptr = this.__wbg_ptr;
				this.__wbg_ptr = 0;
				EpoxyClientFinalization.unregister(this);
				return ptr;
			}
			free() {
				const ptr = this.__destroy_into_raw();
				wasm.__wbg_epoxyclient_free(ptr, 0);
			}
						get redirect_limit() {
				const ret = wasm.__wbg_get_epoxyclient_redirect_limit(
					this.__wbg_ptr,
				);
				return ret >>> 0;
			}
						set redirect_limit(arg0) {
				wasm.__wbg_set_epoxyclient_redirect_limit(this.__wbg_ptr, arg0);
			}
						get user_agent() {
				let deferred1_0;
				let deferred1_1;
				try {
					const ret = wasm.__wbg_get_epoxyclient_user_agent(
						this.__wbg_ptr,
					);
					deferred1_0 = ret[0];
					deferred1_1 = ret[1];
					return getStringFromWasm0(ret[0], ret[1]);
				} finally {
					wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
				}
			}
						set user_agent(arg0) {
				const ptr0 = passStringToWasm0(
					arg0,
					wasm.__wbindgen_malloc,
					wasm.__wbindgen_realloc,
				);
				const len0 = WASM_VECTOR_LEN;
				wasm.__wbg_set_epoxyclient_user_agent(this.__wbg_ptr, ptr0, len0);
			}
						get buffer_size() {
				const ret = wasm.__wbg_get_epoxyclient_buffer_size(this.__wbg_ptr);
				return ret >>> 0;
			}
						set buffer_size(arg0) {
				wasm.__wbg_set_epoxyclient_buffer_size(this.__wbg_ptr, arg0);
			}
						constructor(transport, options) {
				_assertClass(options, EpoxyClientOptions);
				var ptr0 = options.__destroy_into_raw();
				const ret = wasm.epoxyclient_new(transport, ptr0);
				if (ret[2]) {
					throw takeFromExternrefTable0(ret[1]);
				}
				this.__wbg_ptr = ret[0] >>> 0;
				EpoxyClientFinalization.register(this, this.__wbg_ptr, this);
				return this;
			}
						replace_stream_provider() {
				const ret = wasm.epoxyclient_replace_stream_provider(
					this.__wbg_ptr,
				);
				return ret;
			}
						connect_websocket(handlers, url, protocols, headers) {
				_assertClass(handlers, EpoxyHandlers);
				var ptr0 = handlers.__destroy_into_raw();
				const ptr1 = passArrayJsValueToWasm0(
					protocols,
					wasm.__wbindgen_malloc,
				);
				const len1 = WASM_VECTOR_LEN;
				const ret = wasm.epoxyclient_connect_websocket(
					this.__wbg_ptr,
					ptr0,
					url,
					ptr1,
					len1,
					headers,
				);
				return ret;
			}
						connect_tcp(url) {
				const ret = wasm.epoxyclient_connect_tcp(this.__wbg_ptr, url);
				return ret;
			}
						connect_tls(url) {
				const ret = wasm.epoxyclient_connect_tls(this.__wbg_ptr, url);
				return ret;
			}
						connect_udp(url) {
				const ret = wasm.epoxyclient_connect_udp(this.__wbg_ptr, url);
				return ret;
			}
						fetch(url, options) {
				const ret = wasm.epoxyclient_fetch(this.__wbg_ptr, url, options);
				return ret;
			}
		};
		var EpoxyClientOptionsFinalization =
			typeof FinalizationRegistry === "undefined"
				? { register: () => {}, unregister: () => {} }
				: new FinalizationRegistry((ptr) =>
						wasm.__wbg_epoxyclientoptions_free(ptr >>> 0, 1),
					);
		var EpoxyClientOptions = class {
			__destroy_into_raw() {
				const ptr = this.__wbg_ptr;
				this.__wbg_ptr = 0;
				EpoxyClientOptionsFinalization.unregister(this);
				return ptr;
			}
			free() {
				const ptr = this.__destroy_into_raw();
				wasm.__wbg_epoxyclientoptions_free(ptr, 0);
			}
						get wisp_v2() {
				const ret = wasm.__wbg_get_epoxyclientoptions_wisp_v2(
					this.__wbg_ptr,
				);
				return ret !== 0;
			}
						set wisp_v2(arg0) {
				wasm.__wbg_set_epoxyclientoptions_wisp_v2(this.__wbg_ptr, arg0);
			}
						get udp_extension_required() {
				const ret =
					wasm.__wbg_get_epoxyclientoptions_udp_extension_required(
						this.__wbg_ptr,
					);
				return ret !== 0;
			}
						set udp_extension_required(arg0) {
				wasm.__wbg_set_epoxyclientoptions_udp_extension_required(
					this.__wbg_ptr,
					arg0,
				);
			}
						get title_case_headers() {
				const ret = wasm.__wbg_get_epoxyclientoptions_title_case_headers(
					this.__wbg_ptr,
				);
				return ret !== 0;
			}
						set title_case_headers(arg0) {
				wasm.__wbg_set_epoxyclientoptions_title_case_headers(
					this.__wbg_ptr,
					arg0,
				);
			}
						get ws_title_case_headers() {
				const ret = wasm.__wbg_get_epoxyclientoptions_ws_title_case_headers(
					this.__wbg_ptr,
				);
				return ret !== 0;
			}
						set ws_title_case_headers(arg0) {
				wasm.__wbg_set_epoxyclientoptions_ws_title_case_headers(
					this.__wbg_ptr,
					arg0,
				);
			}
						get websocket_protocols() {
				const ret = wasm.__wbg_get_epoxyclientoptions_websocket_protocols(
					this.__wbg_ptr,
				);
				var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
				wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
				return v1;
			}
						set websocket_protocols(arg0) {
				const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
				const len0 = WASM_VECTOR_LEN;
				wasm.__wbg_set_epoxyclientoptions_websocket_protocols(
					this.__wbg_ptr,
					ptr0,
					len0,
				);
			}
						get redirect_limit() {
				const ret = wasm.__wbg_get_epoxyclientoptions_redirect_limit(
					this.__wbg_ptr,
				);
				return ret >>> 0;
			}
						set redirect_limit(arg0) {
				wasm.__wbg_set_epoxyclientoptions_redirect_limit(
					this.__wbg_ptr,
					arg0,
				);
			}
						get header_limit() {
				const ret = wasm.__wbg_get_epoxyclientoptions_header_limit(
					this.__wbg_ptr,
				);
				return ret >>> 0;
			}
						set header_limit(arg0) {
				wasm.__wbg_set_epoxyclientoptions_header_limit(
					this.__wbg_ptr,
					arg0,
				);
			}
						get user_agent() {
				let deferred1_0;
				let deferred1_1;
				try {
					const ret = wasm.__wbg_get_epoxyclientoptions_user_agent(
						this.__wbg_ptr,
					);
					deferred1_0 = ret[0];
					deferred1_1 = ret[1];
					return getStringFromWasm0(ret[0], ret[1]);
				} finally {
					wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
				}
			}
						set user_agent(arg0) {
				const ptr0 = passStringToWasm0(
					arg0,
					wasm.__wbindgen_malloc,
					wasm.__wbindgen_realloc,
				);
				const len0 = WASM_VECTOR_LEN;
				wasm.__wbg_set_epoxyclientoptions_user_agent(
					this.__wbg_ptr,
					ptr0,
					len0,
				);
			}
						get pem_files() {
				const ret = wasm.__wbg_get_epoxyclientoptions_pem_files(
					this.__wbg_ptr,
				);
				var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
				wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
				return v1;
			}
						set pem_files(arg0) {
				const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
				const len0 = WASM_VECTOR_LEN;
				wasm.__wbg_set_epoxyclientoptions_pem_files(
					this.__wbg_ptr,
					ptr0,
					len0,
				);
			}
						get disable_certificate_validation() {
				const ret =
					wasm.__wbg_get_epoxyclientoptions_disable_certificate_validation(
						this.__wbg_ptr,
					);
				return ret !== 0;
			}
						set disable_certificate_validation(arg0) {
				wasm.__wbg_set_epoxyclientoptions_disable_certificate_validation(
					this.__wbg_ptr,
					arg0,
				);
			}
						get buffer_size() {
				const ret = wasm.__wbg_get_epoxyclientoptions_buffer_size(
					this.__wbg_ptr,
				);
				return ret >>> 0;
			}
						set buffer_size(arg0) {
				wasm.__wbg_set_epoxyclientoptions_buffer_size(this.__wbg_ptr, arg0);
			}
			constructor() {
				const ret = wasm.epoxyclientoptions_new_default();
				this.__wbg_ptr = ret >>> 0;
				EpoxyClientOptionsFinalization.register(this, this.__wbg_ptr, this);
				return this;
			}
		};
		var EpoxyHandlersFinalization =
			typeof FinalizationRegistry === "undefined"
				? { register: () => {}, unregister: () => {} }
				: new FinalizationRegistry((ptr) =>
						wasm.__wbg_epoxyhandlers_free(ptr >>> 0, 1),
					);
		var EpoxyHandlers = class {
			__destroy_into_raw() {
				const ptr = this.__wbg_ptr;
				this.__wbg_ptr = 0;
				EpoxyHandlersFinalization.unregister(this);
				return ptr;
			}
			free() {
				const ptr = this.__destroy_into_raw();
				wasm.__wbg_epoxyhandlers_free(ptr, 0);
			}
						get onopen() {
				const ret = wasm.__wbg_get_epoxyhandlers_onopen(this.__wbg_ptr);
				return ret;
			}
						set onopen(arg0) {
				wasm.__wbg_set_epoxyhandlers_onopen(this.__wbg_ptr, arg0);
			}
						get onclose() {
				const ret = wasm.__wbg_get_epoxyhandlers_onclose(this.__wbg_ptr);
				return ret;
			}
						set onclose(arg0) {
				wasm.__wbg_set_epoxyhandlers_onclose(this.__wbg_ptr, arg0);
			}
						get onerror() {
				const ret = wasm.__wbg_get_epoxyhandlers_onerror(this.__wbg_ptr);
				return ret;
			}
						set onerror(arg0) {
				wasm.__wbg_set_epoxyhandlers_onerror(this.__wbg_ptr, arg0);
			}
						get onmessage() {
				const ret = wasm.__wbg_get_epoxyhandlers_onmessage(this.__wbg_ptr);
				return ret;
			}
						set onmessage(arg0) {
				wasm.__wbg_set_epoxyhandlers_onmessage(this.__wbg_ptr, arg0);
			}
						constructor(onopen, onclose, onerror, onmessage) {
				const ret = wasm.epoxyhandlers_new(
					onopen,
					onclose,
					onerror,
					onmessage,
				);
				this.__wbg_ptr = ret >>> 0;
				EpoxyHandlersFinalization.register(this, this.__wbg_ptr, this);
				return this;
			}
		};
		var EpoxyWebSocketFinalization =
			typeof FinalizationRegistry === "undefined"
				? { register: () => {}, unregister: () => {} }
				: new FinalizationRegistry((ptr) =>
						wasm.__wbg_epoxywebsocket_free(ptr >>> 0, 1),
					);
		var EpoxyWebSocket = class _EpoxyWebSocket {
			static __wrap(ptr) {
				ptr = ptr >>> 0;
				const obj = Object.create(_EpoxyWebSocket.prototype);
				obj.__wbg_ptr = ptr;
				EpoxyWebSocketFinalization.register(obj, obj.__wbg_ptr, obj);
				return obj;
			}
			__destroy_into_raw() {
				const ptr = this.__wbg_ptr;
				this.__wbg_ptr = 0;
				EpoxyWebSocketFinalization.unregister(this);
				return ptr;
			}
			free() {
				const ptr = this.__destroy_into_raw();
				wasm.__wbg_epoxywebsocket_free(ptr, 0);
			}
						send(payload) {
				const ret = wasm.epoxywebsocket_send(this.__wbg_ptr, payload);
				return ret;
			}
						close(code, reason) {
				const ptr0 = passStringToWasm0(
					reason,
					wasm.__wbindgen_malloc,
					wasm.__wbindgen_realloc,
				);
				const len0 = WASM_VECTOR_LEN;
				const ret = wasm.epoxywebsocket_close(
					this.__wbg_ptr,
					code,
					ptr0,
					len0,
				);
				return ret;
			}
		};
		var IntoUnderlyingByteSourceFinalization =
			typeof FinalizationRegistry === "undefined"
				? { register: () => {}, unregister: () => {} }
				: new FinalizationRegistry((ptr) =>
						wasm.__wbg_intounderlyingbytesource_free(ptr >>> 0, 1),
					);
		var IntoUnderlyingSinkFinalization =
			typeof FinalizationRegistry === "undefined"
				? { register: () => {}, unregister: () => {} }
				: new FinalizationRegistry((ptr) =>
						wasm.__wbg_intounderlyingsink_free(ptr >>> 0, 1),
					);
		var IntoUnderlyingSink = class _IntoUnderlyingSink {
			static __wrap(ptr) {
				ptr = ptr >>> 0;
				const obj = Object.create(_IntoUnderlyingSink.prototype);
				obj.__wbg_ptr = ptr;
				IntoUnderlyingSinkFinalization.register(obj, obj.__wbg_ptr, obj);
				return obj;
			}
			__destroy_into_raw() {
				const ptr = this.__wbg_ptr;
				this.__wbg_ptr = 0;
				IntoUnderlyingSinkFinalization.unregister(this);
				return ptr;
			}
			free() {
				const ptr = this.__destroy_into_raw();
				wasm.__wbg_intounderlyingsink_free(ptr, 0);
			}
						write(chunk) {
				const ret = wasm.intounderlyingsink_write(this.__wbg_ptr, chunk);
				return ret;
			}
						close() {
				const ptr = this.__destroy_into_raw();
				const ret = wasm.intounderlyingsink_close(ptr);
				return ret;
			}
						abort(reason) {
				const ptr = this.__destroy_into_raw();
				const ret = wasm.intounderlyingsink_abort(ptr, reason);
				return ret;
			}
		};
		var IntoUnderlyingSourceFinalization =
			typeof FinalizationRegistry === "undefined"
				? { register: () => {}, unregister: () => {} }
				: new FinalizationRegistry((ptr) =>
						wasm.__wbg_intounderlyingsource_free(ptr >>> 0, 1),
					);
		var IntoUnderlyingSource = class _IntoUnderlyingSource {
			static __wrap(ptr) {
				ptr = ptr >>> 0;
				const obj = Object.create(_IntoUnderlyingSource.prototype);
				obj.__wbg_ptr = ptr;
				IntoUnderlyingSourceFinalization.register(obj, obj.__wbg_ptr, obj);
				return obj;
			}
			__destroy_into_raw() {
				const ptr = this.__wbg_ptr;
				this.__wbg_ptr = 0;
				IntoUnderlyingSourceFinalization.unregister(this);
				return ptr;
			}
			free() {
				const ptr = this.__destroy_into_raw();
				wasm.__wbg_intounderlyingsource_free(ptr, 0);
			}
						pull(controller) {
				const ret = wasm.intounderlyingsource_pull(
					this.__wbg_ptr,
					controller,
				);
				return ret;
			}
			cancel() {
				const ptr = this.__destroy_into_raw();
				wasm.intounderlyingsource_cancel(ptr);
			}
		};
		async function __wbg_load(module2, imports) {
			if (typeof Response === "function" && module2 instanceof Response) {
				if (typeof WebAssembly.instantiateStreaming === "function") {
					try {
						return await WebAssembly.instantiateStreaming(
							module2,
							imports,
						);
					} catch (e) {
						if (
							module2.headers.get("Content-Type") != "application/wasm"
						) {
							console.warn(
								"`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n",
								e,
							);
						} else {
							throw e;
						}
					}
				}
				const bytes = await module2.arrayBuffer();
				return await WebAssembly.instantiate(bytes, imports);
			} else {
				const instance = await WebAssembly.instantiate(module2, imports);
				if (instance instanceof WebAssembly.Instance) {
					return { instance, module: module2 };
				} else {
					return instance;
				}
			}
		}
		function __wbg_get_imports() {
			const imports = {};
			imports.wbg = {};
			imports.wbg.__wbg_get_5419cf6b954aa11d = function (arg0, arg1) {
				const ret = arg0[arg1 >>> 0];
				return ret;
			};
			imports.wbg.__wbg_instanceof_Promise_f3fd1bcac3157f0c = function (
				arg0,
			) {
				let result;
				try {
					result = arg0 instanceof Promise;
				} catch (_) {
					result = false;
				}
				const ret = result;
				return ret;
			};
			imports.wbg.__wbg_objectget_6c331054ce8fcca9 = function (
				arg0,
				arg1,
				arg2,
			) {
				const ret = object_get(arg0, getStringFromWasm0(arg1, arg2));
				return ret;
			};
			imports.wbg.__wbg_getReader_584431a478f1339c = function () {
				return handleError(function (arg0) {
					const ret = arg0.getReader();
					return ret;
				}, arguments);
			};
			imports.wbg.__wbg_getWriter_2fe953e01e7ca9c5 = function () {
				return handleError(function (arg0) {
					const ret = arg0.getWriter();
					return ret;
				}, arguments);
			};
			imports.wbg.__wbindgen_string_get = function (arg0, arg1) {
				const obj = arg1;
				const ret = typeof obj === "string" ? obj : void 0;
				var ptr1 = isLikeNone(ret)
					? 0
					: passStringToWasm0(
							ret,
							wasm.__wbindgen_malloc,
							wasm.__wbindgen_realloc,
						);
				var len1 = WASM_VECTOR_LEN;
				getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
				getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
			};
			imports.wbg.__wbindgen_is_falsy = function (arg0) {
				const ret = !arg0;
				return ret;
			};
			imports.wbg.__wbindgen_string_new = function (arg0, arg1) {
				const ret = getStringFromWasm0(arg0, arg1);
				return ret;
			};
			imports.wbg.__wbg_new_034f913e7636e987 = function () {
				const ret = new Array();
				return ret;
			};
			imports.wbg.__wbg_of_7e03bb557d6a64cc = function (arg0, arg1) {
				const ret = Array.of(arg0, arg1);
				return ret;
			};
			imports.wbg.__wbg_push_36cf4d81d7da33d1 = function (arg0, arg1) {
				const ret = arg0.push(arg1);
				return ret;
			};
			imports.wbg.__wbg_new_e69b5f66fda8f13c = function () {
				const ret = new Object();
				return ret;
			};
			imports.wbg.__wbg_setheaders_d48810c9779f36b3 = function (arg0, arg1) {
				arg0.headers = arg1;
			};
			imports.wbg.__wbg_setstatus_196540ea958edeed = function (arg0, arg1) {
				arg0.status = arg1;
			};
			imports.wbg.__wbg_setstatustext_4667131a60e2d571 = function (
				arg0,
				arg1,
				arg2,
			) {
				arg0.statusText = getStringFromWasm0(arg1, arg2);
			};
			imports.wbg.__wbg_newwithoptreadablestreamandinit_37705e7046d5e4ff =
				function () {
					return handleError(function (arg0, arg1) {
						const ret = new Response(arg0, arg1);
						return ret;
					}, arguments);
				};
			imports.wbg.__wbg_defineproperty_cc1ca3eba7892369 = function (
				arg0,
				arg1,
				arg2,
				arg3,
			) {
				define_property(arg0, getStringFromWasm0(arg1, arg2), arg3);
			};
			imports.wbg.__wbindgen_is_array = function (arg0) {
				const ret = Array.isArray(arg0);
				return ret;
			};
			imports.wbg.__wbg_objectset_127d41af3ca9fa70 = function (
				arg0,
				arg1,
				arg2,
				arg3,
			) {
				object_set(arg0, getStringFromWasm0(arg1, arg2), arg3);
			};
			imports.wbg.__wbg_from_91a67a5f04c98a54 = function (arg0) {
				const ret = Array.from(arg0);
				return ret;
			};
			imports.wbg.__wbg_wskey_284ae2640195cb26 = function (arg0) {
				const ret = ws_key();
				const ptr1 = passStringToWasm0(
					ret,
					wasm.__wbindgen_malloc,
					wasm.__wbindgen_realloc,
				);
				const len1 = WASM_VECTOR_LEN;
				getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
				getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
			};
			imports.wbg.__wbg_epoxywebsocket_new = function (arg0) {
				const ret = EpoxyWebSocket.__wrap(arg0);
				return ret;
			};
			imports.wbg.__wbindgen_cb_drop = function (arg0) {
				const obj = arg0.original;
				if (obj.cnt-- == 1) {
					obj.a = 0;
					return true;
				}
				const ret = false;
				return ret;
			};
			imports.wbg.__wbg_cancel_2a3c2f3c115ac7e0 = function (arg0) {
				const ret = arg0.cancel();
				return ret;
			};
			imports.wbg.__wbg_catch_8097da4375a5dd1b = function (arg0, arg1) {
				const ret = arg0.catch(arg1);
				return ret;
			};
			imports.wbg.__wbindgen_error_new = function (arg0, arg1) {
				const ret = new Error(getStringFromWasm0(arg0, arg1));
				return ret;
			};
			imports.wbg.__wbg_instanceof_Url_f00efbf8074b8fcf = function (arg0) {
				let result;
				try {
					result = arg0 instanceof URL;
				} catch (_) {
					result = false;
				}
				const ret = result;
				return ret;
			};
			imports.wbg.__wbg_href_07ab8fba72e97d85 = function (arg0, arg1) {
				const ret = arg1.href;
				const ptr1 = passStringToWasm0(
					ret,
					wasm.__wbindgen_malloc,
					wasm.__wbindgen_realloc,
				);
				const len1 = WASM_VECTOR_LEN;
				getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
				getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
			};
			imports.wbg.__wbg_new_fec2611eb9180f95 = function (arg0) {
				const ret = new Uint8Array(arg0);
				return ret;
			};
			imports.wbg.__wbg_newwithintounderlyingsink_3ea7ceafb3e69daf =
				function (arg0) {
					const ret = new WritableStream(IntoUnderlyingSink.__wrap(arg0));
					return ret;
				};
			imports.wbg.__wbg_log_3a0e1cfbf87d0053 = function (arg0, arg1) {
				console.log(getStringFromWasm0(arg0, arg1));
			};
			imports.wbg.__wbg_convertbodyinner_14e8d0d8e8eff308 = function () {
				return handleError(function (arg0) {
					const ret = convert_body_inner(arg0);
					return ret;
				}, arguments);
			};
			imports.wbg.__wbg_at_2c39eacdcce73361 = function (arg0, arg1) {
				const ret = arg0.at(arg1);
				return ret;
			};
			imports.wbg.__wbg_entriesofobjectinner_e31ab96d864913e6 = function (
				arg0,
				arg1,
			) {
				const ret = entries_of_object_inner(arg1);
				const ptr1 = passArrayJsValueToWasm0(ret, wasm.__wbindgen_malloc);
				const len1 = WASM_VECTOR_LEN;
				getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
				getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
			};
			imports.wbg.__wbg_length_f217bbbf7e8e4df4 = function (arg0) {
				const ret = arg0.length;
				return ret;
			};
			imports.wbg.__wbg_error_d4df4e5c9ec7c1cb = function (arg0, arg1) {
				console.error(getStringFromWasm0(arg0, arg1));
			};
			imports.wbg.__wbg_data_134d3a704b9fca32 = function (arg0) {
				const ret = arg0.data;
				return ret;
			};
			imports.wbg.__wbg_instanceof_Error_a0af335a62107964 = function (arg0) {
				let result;
				try {
					result = arg0 instanceof Error;
				} catch (_) {
					result = false;
				}
				const ret = result;
				return ret;
			};
			imports.wbg.__wbg_toString_4b677455b9167e31 = function (arg0) {
				const ret = arg0.toString();
				return ret;
			};
			imports.wbg.__wbg_read_08d62388e7870059 = function (arg0) {
				const ret = arg0.read();
				return ret;
			};
			imports.wbg.__wbg_done_510de141aaf69a99 = function (arg0) {
				const ret = arg0.done;
				return ret;
			};
			imports.wbg.__wbg_value_3ef4965e9c7085be = function (arg0) {
				const ret = arg0.value;
				return ret;
			};
			imports.wbg.__wbg_write_8516d1ea4c89b39d = function (arg0, arg1) {
				const ret = arg0.write(arg1);
				return ret;
			};
			imports.wbg.__wbg_abort_9e2d9deeb851d8ca = function (arg0) {
				const ret = arg0.abort();
				return ret;
			};
			imports.wbg.__wbg_fromentries_f05f98ee2edb06d8 = function () {
				return handleError(function (arg0) {
					const ret = from_entries(arg0);
					return ret;
				}, arguments);
			};
			imports.wbg.__wbg_new_1073970097e5a420 = function (arg0, arg1) {
				try {
					var state0 = { a: arg0, b: arg1 };
					var cb0 = (arg02, arg12) => {
						const a = state0.a;
						state0.a = 0;
						try {
							return __wbg_adapter_169(a, state0.b, arg02, arg12);
						} finally {
							state0.a = a;
						}
					};
					const ret = new Promise(cb0);
					return ret;
				} finally {
					state0.a = state0.b = 0;
				}
			};
			imports.wbg.__wbg_send_fe006eb24f5e2694 = function () {
				return handleError(function (arg0, arg1, arg2) {
					arg0.send(getArrayU8FromWasm0(arg1, arg2));
				}, arguments);
			};
			imports.wbg.__wbindgen_is_function = function (arg0) {
				const ret = typeof arg0 === "function";
				return ret;
			};
			imports.wbg.__wbg_wsprotocol_da3c44bfdcf4831d = function (arg0) {
				const ret = ws_protocol();
				const ptr1 = passStringToWasm0(
					ret,
					wasm.__wbindgen_malloc,
					wasm.__wbindgen_realloc,
				);
				const len1 = WASM_VECTOR_LEN;
				getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
				getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
			};
			imports.wbg.__wbg_newwithstrsequence_e105150b01b32f72 = function () {
				return handleError(function (arg0, arg1, arg2) {
					const ret = new WebSocket(getStringFromWasm0(arg0, arg1), arg2);
					return ret;
				}, arguments);
			};
			imports.wbg.__wbg_new_d550f7a7120dd942 = function () {
				return handleError(function (arg0, arg1) {
					const ret = new WebSocket(getStringFromWasm0(arg0, arg1));
					return ret;
				}, arguments);
			};
			imports.wbg.__wbg_setbinaryType_2befea8ba88b61e2 = function (
				arg0,
				arg1,
			) {
				arg0.binaryType = __wbindgen_enum_BinaryType[arg1];
			};
			imports.wbg.__wbg_setonmessage_84cd941c1df08da7 = function (
				arg0,
				arg1,
			) {
				arg0.onmessage = arg1;
			};
			imports.wbg.__wbg_setonopen_c0e1464e3ea28727 = function (arg0, arg1) {
				arg0.onopen = arg1;
			};
			imports.wbg.__wbg_setonclose_9a28780f7d46ed03 = function (arg0, arg1) {
				arg0.onclose = arg1;
			};
			imports.wbg.__wbg_setonerror_e16deca7fd15a59c = function (arg0, arg1) {
				arg0.onerror = arg1;
			};
			imports.wbg.__wbindgen_is_object = function (arg0) {
				const val = arg0;
				const ret = typeof val === "object" && val !== null;
				return ret;
			};
			imports.wbg.__wbg_subarray_975a06f9dbd16995 = function (
				arg0,
				arg1,
				arg2,
			) {
				const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
				return ret;
			};
			imports.wbg.__wbg_getRandomValues_3aa56aa6edec874c = function () {
				return handleError(function (arg0, arg1) {
					arg0.getRandomValues(arg1);
				}, arguments);
			};
			imports.wbg.__wbindgen_memory = function () {
				const ret = wasm.memory;
				return ret;
			};
			imports.wbg.__wbg_buffer_ccaed51a635d8a2d = function (arg0) {
				const ret = arg0.buffer;
				return ret;
			};
			imports.wbg.__wbg_newwithbyteoffsetandlength_7e3eb787208af730 =
				function (arg0, arg1, arg2) {
					const ret = new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
					return ret;
				};
			imports.wbg.__wbg_randomFillSync_5c9c955aa56b6049 = function () {
				return handleError(function (arg0, arg1) {
					arg0.randomFillSync(arg1);
				}, arguments);
			};
			imports.wbg.__wbg_crypto_1d1f22824a6a080c = function (arg0) {
				const ret = arg0.crypto;
				return ret;
			};
			imports.wbg.__wbg_process_4a72847cc503995b = function (arg0) {
				const ret = arg0.process;
				return ret;
			};
			imports.wbg.__wbg_versions_f686565e586dd935 = function (arg0) {
				const ret = arg0.versions;
				return ret;
			};
			imports.wbg.__wbg_node_104a2ff8d6ea03a2 = function (arg0) {
				const ret = arg0.node;
				return ret;
			};
			imports.wbg.__wbindgen_is_string = function (arg0) {
				const ret = typeof arg0 === "string";
				return ret;
			};
			imports.wbg.__wbg_require_cca90b1a94a0255b = function () {
				return handleError(function () {
					const ret = module.require;
					return ret;
				}, arguments);
			};
			imports.wbg.__wbg_msCrypto_eb05e62b530a1508 = function (arg0) {
				const ret = arg0.msCrypto;
				return ret;
			};
			imports.wbg.__wbg_newwithlength_76462a666eca145f = function (arg0) {
				const ret = new Uint8Array(arg0 >>> 0);
				return ret;
			};
			imports.wbg.__wbg_get_ef828680c64da212 = function () {
				return handleError(function (arg0, arg1) {
					const ret = Reflect.get(arg0, arg1);
					return ret;
				}, arguments);
			};
			imports.wbg.__wbg_now_d3cbc9581625f686 = function (arg0) {
				const ret = arg0.now();
				return ret;
			};
			imports.wbg.__wbg_call_a9ef466721e824f2 = function () {
				return handleError(function (arg0, arg1) {
					const ret = arg0.call(arg1);
					return ret;
				}, arguments);
			};
			imports.wbg.__wbg_self_bf91bf94d9e04084 = function () {
				return handleError(function () {
					const ret = self.self;
					return ret;
				}, arguments);
			};
			imports.wbg.__wbg_window_52dd9f07d03fd5f8 = function () {
				return handleError(function () {
					const ret = window.window;
					return ret;
				}, arguments);
			};
			imports.wbg.__wbg_globalThis_05c129bf37fcf1be = function () {
				return handleError(function () {
					const ret = globalThis.globalThis;
					return ret;
				}, arguments);
			};
			imports.wbg.__wbg_global_3eca19bb09e9c484 = function () {
				return handleError(function () {
					const ret = global.global;
					return ret;
				}, arguments);
			};
			imports.wbg.__wbindgen_is_undefined = function (arg0) {
				const ret = arg0 === void 0;
				return ret;
			};
			imports.wbg.__wbg_newnoargs_1ede4bf2ebbaaf43 = function (arg0, arg1) {
				const ret = new Function(getStringFromWasm0(arg0, arg1));
				return ret;
			};
			imports.wbg.__wbg_instanceof_ArrayBuffer_74945570b4a62ec7 = function (
				arg0,
			) {
				let result;
				try {
					result = arg0 instanceof ArrayBuffer;
				} catch (_) {
					result = false;
				}
				const ret = result;
				return ret;
			};
			imports.wbg.__wbg_call_3bfa248576352471 = function () {
				return handleError(function (arg0, arg1, arg2) {
					const ret = arg0.call(arg1, arg2);
					return ret;
				}, arguments);
			};
			imports.wbg.__wbg_set_ec2fcf81bc573fd9 = function (arg0, arg1, arg2) {
				arg0.set(arg1, arg2 >>> 0);
			};
			imports.wbg.__wbg_length_9254c4bd3b9f23c4 = function (arg0) {
				const ret = arg0.length;
				return ret;
			};
			imports.wbg.__wbg_now_70af4fe37a792251 = function () {
				const ret = Date.now();
				return ret;
			};
			imports.wbg.__wbindgen_throw = function (arg0, arg1) {
				throw new Error(getStringFromWasm0(arg0, arg1));
			};
			imports.wbg.__wbindgen_debug_string = function (arg0, arg1) {
				const ret = debugString(arg1);
				const ptr1 = passStringToWasm0(
					ret,
					wasm.__wbindgen_malloc,
					wasm.__wbindgen_realloc,
				);
				const len1 = WASM_VECTOR_LEN;
				getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
				getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
			};
			imports.wbg.__wbg_then_748f75edfb032440 = function (arg0, arg1) {
				const ret = arg0.then(arg1);
				return ret;
			};
			imports.wbg.__wbg_queueMicrotask_c5419c06eab41e73 =
				typeof queueMicrotask == "function"
					? queueMicrotask
					: notDefined("queueMicrotask");
			imports.wbg.__wbg_then_4866a7d9f55d8f3e = function (arg0, arg1, arg2) {
				const ret = arg0.then(arg1, arg2);
				return ret;
			};
			imports.wbg.__wbg_queueMicrotask_848aa4969108a57e = function (arg0) {
				const ret = arg0.queueMicrotask;
				return ret;
			};
			imports.wbg.__wbg_resolve_0aad7c1484731c99 = function (arg0) {
				const ret = Promise.resolve(arg0);
				return ret;
			};
			imports.wbg.__wbg_close_cfd08d9cf9f36856 = function () {
				return handleError(function (arg0) {
					arg0.close();
				}, arguments);
			};
			imports.wbg.__wbg_enqueue_e693a6fb4f3261c1 = function () {
				return handleError(function (arg0, arg1) {
					arg0.enqueue(arg1);
				}, arguments);
			};
			imports.wbg.__wbg_byobRequest_86ac467c94924d3c = function (arg0) {
				const ret = arg0.byobRequest;
				return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
			};
			imports.wbg.__wbg_view_de0e81c5c00d2129 = function (arg0) {
				const ret = arg0.view;
				return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
			};
			imports.wbg.__wbg_byteLength_5d623ba3d92a3a9c = function (arg0) {
				const ret = arg0.byteLength;
				return ret;
			};
			imports.wbg.__wbg_close_7cda9dd901230214 = function () {
				return handleError(function (arg0) {
					arg0.close();
				}, arguments);
			};
			imports.wbg.__wbg_new_70a2f23d1565c04c = function (arg0, arg1) {
				const ret = new Error(getStringFromWasm0(arg0, arg1));
				return ret;
			};
			imports.wbg.__wbg_buffer_95102df5554646dc = function (arg0) {
				const ret = arg0.buffer;
				return ret;
			};
			imports.wbg.__wbg_byteOffset_ec0928143c619cd7 = function (arg0) {
				const ret = arg0.byteOffset;
				return ret;
			};
			imports.wbg.__wbg_sethighWaterMark_10a9c5bcdaa54044 = function (
				arg0,
				arg1,
			) {
				arg0.highWaterMark = arg1;
			};
			imports.wbg.__wbg_newwithintounderlyingsource_db318e6b93dffa9b =
				function (arg0, arg1) {
					const ret = new ReadableStream(
						IntoUnderlyingSource.__wrap(arg0),
						arg1,
					);
					return ret;
				};
			imports.wbg.__wbg_setTimeout_2cb6c793c4aa44f8 = function () {
				return handleError(function (arg0, arg1, arg2) {
					const ret = arg0.setTimeout(arg1, arg2);
					return ret;
				}, arguments);
			};
			imports.wbg.__wbg_performance_ffc4e815dfb3449f = function (arg0) {
				const ret = arg0.performance;
				return ret;
			};
			imports.wbg.__wbg_now_8799be02ba81a22e = function (arg0) {
				const ret = arg0.now();
				return ret;
			};
			imports.wbg.__wbg_instanceof_Headers_b23ad138f4ce041e = function (
				arg0,
			) {
				let result;
				try {
					result = arg0 instanceof Headers;
				} catch (_) {
					result = false;
				}
				const ret = result;
				return ret;
			};
			imports.wbg.__wbg_respond_ffb6928cd9b79c32 = function () {
				return handleError(function (arg0, arg1) {
					arg0.respond(arg1 >>> 0);
				}, arguments);
			};
			imports.wbg.__wbg_releaseLock_32c310d7be334e1c = function (arg0) {
				arg0.releaseLock();
			};
			imports.wbg.__wbg_close_9e3b743c528a8d31 = function () {
				return handleError(function (arg0) {
					arg0.close();
				}, arguments);
			};
			imports.wbg.__wbindgen_closure_wrapper414 = function (
				arg0,
				arg1,
				arg2,
			) {
				const ret = makeClosure(arg0, arg1, 18, __wbg_adapter_34);
				return ret;
			};
			imports.wbg.__wbindgen_closure_wrapper416 = function (
				arg0,
				arg1,
				arg2,
			) {
				const ret = makeClosure(arg0, arg1, 18, __wbg_adapter_37);
				return ret;
			};
			imports.wbg.__wbindgen_closure_wrapper418 = function (
				arg0,
				arg1,
				arg2,
			) {
				const ret = makeClosure(arg0, arg1, 18, __wbg_adapter_34);
				return ret;
			};
			imports.wbg.__wbindgen_closure_wrapper1334 = function (
				arg0,
				arg1,
				arg2,
			) {
				const ret = makeMutClosure(arg0, arg1, 202, __wbg_adapter_42);
				return ret;
			};
			imports.wbg.__wbindgen_closure_wrapper4067 = function (
				arg0,
				arg1,
				arg2,
			) {
				const ret = makeMutClosure(arg0, arg1, 202, __wbg_adapter_45);
				return ret;
			};
			imports.wbg.__wbindgen_init_externref_table = function () {
				const table = wasm.__wbindgen_export_2;
				const offset = table.grow(4);
				table.set(0, void 0);
				table.set(offset + 0, void 0);
				table.set(offset + 1, null);
				table.set(offset + 2, true);
				table.set(offset + 3, false);
			};
			return imports;
		}
		function __wbg_init_memory(imports, memory) {}
		function __wbg_finalize_init(instance, module2) {
			wasm = instance.exports;
			__wbg_init.__wbindgen_wasm_module = module2;
			cachedDataViewMemory0 = null;
			cachedUint8ArrayMemory0 = null;
			wasm.__wbindgen_start();
			return wasm;
		}
		async function __wbg_init(module_or_path) {
			module_or_path = module_or_path || {};
			module_or_path.module_or_path = Uint8Array.from(
				atob(
					"AGFzbQEAAAABoQZlYAN/f38Bf2ABfwBgA39/fwBgAn9/AGACf38Bf2AEf39/fwBgAX8Bf2AFf39/f38AYAR/f39/AX9gBn9/f39/fwBgBX9/f39/AX9gB39/f39/f38AYAFvAW9gAW8Bf2AHf39/f39/fwF/YAh/f39/f39/fwBgAAF/YAR/f39+AGAGf39/f39/AX9gAn9vAGABfwFvYAJ/bwFvYAABb2ACb28AYAN/f38BfmACb28Bb2AJf39/f39/f39/AGACf38Bb2AAAn9/YAFvAGADf39/AW9gAABgAX8Cf39gCX9/f39/f39/fgBgA39+fwBgAnx8AX9gAX4Bf2ADb39/AW9gAm9/AGAJf39/f39/f39/AX9gCn9/f39/f39/f38AYAF/AX5gA39+fgBgA39/fgBgAm9/AW9gA29/fwBgBG9/f28AYAFvAXxgA29vbwFvYAABfGAEf39+fwBgDH9/f39/f39/f39/fwBgBn9/f35/fwBgC39/f39/f39/f39/AGAEf39+fgBgAn9/AX5gA35+fwF+YAJ/fgBgA39+fwF/YAd/f35/f39/AGADf39+AX9gC39/f39/f39/f39/AX9gAX4BfmAEf35/fwBgAn9+AX9gAn5/AGADf39vAGAAA39/f2ACb28Bf2ADf39vAW9gA29vfwBgAm98AGADb29/AX9gCH9/f39/f39+AGACf3wAYAZ/f35+f38AYAR/f35/AX9gB39+f39/f38AYAN+fn8Bf2ADfn9/AX9gF39/f39/f39/f39/f39/f39/f39/f39/AX9gE39/f39/f39/f39/f39/f39/f38Bf2AHf39/f35/fwBgBH5/fn8Bf2AEb29vbwF/YAZ/f29/f28Bb2ACb38Df39/YAN/b28Bb2AFf39+f38AYAV/f3x/fwBgBH98f38AYAV/f31/fwBgBH99f38AYAR/f29vAGAEf39/fwFvYAN/f38Cf39gBX9+f39/AX9gFX9/f39/f39/f39/f39/f39/f39/fwF/YA1/f39/f39/f39/f39/AX9gBX9/f39/AX5gBH9/f38Cf38C3SF0A3diZxpfX3diZ19nZXRfNTQxOWNmNmI5NTRhYTExZAAsA3diZylfX3diZ19pbnN0YW5jZW9mX1Byb21pc2VfZjNmZDFiY2FjMzE1N2YwYwANA3diZyBfX3diZ19vYmplY3RnZXRfNmMzMzEwNTRjZThmY2NhOQAlA3diZyBfX3diZ19nZXRSZWFkZXJfNTg0NDMxYTQ3OGYxMzM5YwAMA3diZyBfX3diZ19nZXRXcml0ZXJfMmZlOTUzZTAxZTdjYTljNQAMA3diZxVfX3diaW5kZ2VuX3N0cmluZ19nZXQAEwN3YmcTX193YmluZGdlbl9pc19mYWxzeQANA3diZxVfX3diaW5kZ2VuX3N0cmluZ19uZXcAGwN3YmcaX193YmdfbmV3XzAzNGY5MTNlNzYzNmU5ODcAFgN3YmcZX193Ymdfb2ZfN2UwM2JiNTU3ZDZhNjRjYwAZA3diZxtfX3diZ19wdXNoXzM2Y2Y0ZDgxZDdkYTMzZDEARAN3YmcaX193YmdfbmV3X2U2OWI1ZjY2ZmRhOGYxM2MAFgN3YmchX193Ymdfc2V0aGVhZGVyc19kNDg4MTBjOTc3OWYzNmIzABcDd2JnIF9fd2JnX3NldHN0YXR1c18xOTY1NDBlYTk1OGVkZWVkACYDd2JnJF9fd2JnX3NldHN0YXR1c3RleHRfNDY2NzEzMWE2MGUyZDU3MQAtA3diZzZfX3diZ19uZXd3aXRob3B0cmVhZGFibGVzdHJlYW1hbmRpbml0XzM3NzA1ZTcwNDZkNWU0ZmYAGQN3YmclX193YmdfZGVmaW5lcHJvcGVydHlfY2MxY2EzZWJhNzg5MjM2OQAuA3diZxNfX3diaW5kZ2VuX2lzX2FycmF5AA0Dd2JnIF9fd2JnX29iamVjdHNldF8xMjdkNDFhZjNjYTlmYTcwAC4Dd2JnG19fd2JnX2Zyb21fOTFhNjdhNWYwNGM5OGE1NAAMA3diZxxfX3diZ193c2tleV8yODRhZTI2NDAxOTVjYjI2AAEDd2JnGF9fd2JnX2Vwb3h5d2Vic29ja2V0X25ldwAUA3diZxJfX3diaW5kZ2VuX2NiX2Ryb3AADQN3YmcdX193YmdfY2FuY2VsXzJhM2MyZjNjMTE1YWM3ZTAADAN3YmccX193YmdfY2F0Y2hfODA5N2RhNDM3NWE1ZGQxYgAZA3diZxRfX3diaW5kZ2VuX2Vycm9yX25ldwAbA3diZyVfX3diZ19pbnN0YW5jZW9mX1VybF9mMDBlZmJmODA3NGI4ZmNmAA0Dd2JnG19fd2JnX2hyZWZfMDdhYjhmYmE3MmU5N2Q4NQATA3diZxpfX3diZ19uZXdfZmVjMjYxMWViOTE4MGY5NQAMA3diZzBfX3diZ19uZXd3aXRoaW50b3VuZGVybHlpbmdzaW5rXzNlYTdjZWFmYjNlNjlkYWYAFAN3YmcaX193YmdfbG9nXzNhMGUxY2ZiZjg3ZDAwNTMAAwN3YmcnX193YmdfY29udmVydGJvZHlpbm5lcl8xNGU4ZDBkOGU4ZWZmMzA4AAwDd2JnGV9fd2JnX2F0XzJjMzllYWNkY2NlNzMzNjEALAN3YmcrX193YmdfZW50cmllc29mb2JqZWN0aW5uZXJfZTMxYWI5NmQ4NjQ5MTNlNgATA3diZx1fX3diZ19sZW5ndGhfZjIxN2JiYmY3ZThlNGRmNAANA3diZxxfX3diZ19lcnJvcl9kNGRmNGU1YzllYzdjMWNiAAMDd2JnG19fd2JnX2RhdGFfMTM0ZDNhNzA0YjlmY2EzMgAMA3diZydfX3diZ19pbnN0YW5jZW9mX0Vycm9yX2EwYWYzMzVhNjIxMDc5NjQADQN3YmcfX193YmdfdG9TdHJpbmdfNGI2Nzc0NTViOTE2N2UzMQAMA3diZxtfX3diZ19yZWFkXzA4ZDYyMzg4ZTc4NzAwNTkADAN3YmcbX193YmdfZG9uZV81MTBkZTE0MWFhZjY5YTk5AA0Dd2JnHF9fd2JnX3ZhbHVlXzNlZjQ5NjVlOWM3MDg1YmUADAN3YmccX193Ymdfd3JpdGVfODUxNmQxZWE0Yzg5YjM5ZAAZA3diZxxfX3diZ19hYm9ydF85ZTJkOWRlZWI4NTFkOGNhAAwDd2JnIl9fd2JnX2Zyb21lbnRyaWVzX2YwNWY5OGVlMmVkYjA2ZDgADAN3YmcaX193YmdfbmV3XzEwNzM5NzAwOTdlNWE0MjAAGwN3YmcbX193Ymdfc2VuZF9mZTAwNmViMjRmNWUyNjk0AC0Dd2JnFl9fd2JpbmRnZW5faXNfZnVuY3Rpb24ADQN3YmchX193Ymdfd3Nwcm90b2NvbF9kYTNjNDRiZmRjZjQ4MzFkAAEDd2JnKV9fd2JnX25ld3dpdGhzdHJzZXF1ZW5jZV9lMTA1MTUwYjAxYjMyZjcyAEUDd2JnGl9fd2JnX25ld19kNTUwZjdhNzEyMGRkOTQyABsDd2JnJF9fd2JnX3NldGJpbmFyeVR5cGVfMmJlZmVhOGJhODhiNjFlMgAmA3diZyNfX3diZ19zZXRvbm1lc3NhZ2VfODRjZDk0MWMxZGYwOGRhNwAXA3diZyBfX3diZ19zZXRvbm9wZW5fYzBlMTQ2NGUzZWEyODcyNwAXA3diZyFfX3diZ19zZXRvbmNsb3NlXzlhMjg3ODBmN2Q0NmVkMDMAFwN3YmchX193Ymdfc2V0b25lcnJvcl9lMTZkZWNhN2ZkMTVhNTljABcDd2JnFF9fd2JpbmRnZW5faXNfb2JqZWN0AA0Dd2JnH19fd2JnX3N1YmFycmF5Xzk3NWEwNmY5ZGJkMTY5OTUAJQN3YmcmX193YmdfZ2V0UmFuZG9tVmFsdWVzXzNhYTU2YWE2ZWRlYzg3NGMAFwN3YmcRX193YmluZGdlbl9tZW1vcnkAFgN3YmcdX193YmdfYnVmZmVyX2NjYWVkNTFhNjM1ZDhhMmQADAN3YmcxX193YmdfbmV3d2l0aGJ5dGVvZmZzZXRhbmRsZW5ndGhfN2UzZWI3ODcyMDhhZjczMAAlA3diZyVfX3diZ19yYW5kb21GaWxsU3luY181YzljOTU1YWE1NmI2MDQ5ABcDd2JnHV9fd2JnX2NyeXB0b18xZDFmMjI4MjRhNmEwODBjAAwDd2JnHl9fd2JnX3Byb2Nlc3NfNGE3Mjg0N2NjNTAzOTk1YgAMA3diZx9fX3diZ192ZXJzaW9uc19mNjg2NTY1ZTU4NmRkOTM1AAwDd2JnG19fd2JnX25vZGVfMTA0YTJmZjhkNmVhMDNhMgAMA3diZxRfX3diaW5kZ2VuX2lzX3N0cmluZwANA3diZx5fX3diZ19yZXF1aXJlX2NjYTkwYjFhOTRhMDI1NWIAFgN3YmcfX193YmdfbXNDcnlwdG9fZWIwNWU2MmI1MzBhMTUwOAAMA3diZyRfX3diZ19uZXd3aXRobGVuZ3RoXzc2NDYyYTY2NmVjYTE0NWYAFAN3YmcaX193YmdfZ2V0X2VmODI4NjgwYzY0ZGEyMTIAGQN3YmcaX193Ymdfbm93X2QzY2JjOTU4MTYyNWY2ODYALwN3YmcbX193YmdfY2FsbF9hOWVmNDY2NzIxZTgyNGYyABkDd2JnG19fd2JnX3NlbGZfYmY5MWJmOTRkOWUwNDA4NAAWA3diZx1fX3diZ193aW5kb3dfNTJkZDlmMDdkMDNmZDVmOAAWA3diZyFfX3diZ19nbG9iYWxUaGlzXzA1YzEyOWJmMzdmY2YxYmUAFgN3YmcdX193YmdfZ2xvYmFsXzNlY2ExOWJiMDllOWM0ODQAFgN3YmcXX193YmluZGdlbl9pc191bmRlZmluZWQADQN3YmcgX193YmdfbmV3bm9hcmdzXzFlZGU0YmYyZWJiYWFmNDMAGwN3YmctX193YmdfaW5zdGFuY2VvZl9BcnJheUJ1ZmZlcl83NDk0NTU3MGI0YTYyZWM3AA0Dd2JnG19fd2JnX2NhbGxfM2JmYTI0ODU3NjM1MjQ3MQAwA3diZxpfX3diZ19zZXRfZWMyZmNmODFiYzU3M2ZkOQBGA3diZx1fX3diZ19sZW5ndGhfOTI1NGM0YmQzYjlmMjNjNAANA3diZxpfX3diZ19ub3dfNzBhZjRmZTM3YTc5MjI1MQAxA3diZxBfX3diaW5kZ2VuX3Rocm93AAMDd2JnF19fd2JpbmRnZW5fZGVidWdfc3RyaW5nABMDd2JnG19fd2JnX3RoZW5fNzQ4Zjc1ZWRmYjAzMjQ0MAAZA3diZyVfX3diZ19xdWV1ZU1pY3JvdGFza19jNTQxOWMwNmVhYjQxZTczAB0Dd2JnG19fd2JnX3RoZW5fNDg2NmE3ZDlmNTVkOGYzZQAwA3diZyVfX3diZ19xdWV1ZU1pY3JvdGFza184NDhhYTQ5NjkxMDhhNTdlAAwDd2JnHl9fd2JnX3Jlc29sdmVfMGFhZDdjMTQ4NDczMWM5OQAMA3diZxxfX3diZ19jbG9zZV9jZmQwOGQ5Y2Y5ZjM2ODU2AB0Dd2JnHl9fd2JnX2VucXVldWVfZTY5M2E2ZmI0ZjMyNjFjMQAXA3diZyJfX3diZ19ieW9iUmVxdWVzdF84NmFjNDY3Yzk0OTI0ZDNjAA0Dd2JnG19fd2JnX3ZpZXdfZGUwZTgxYzVjMDBkMjEyOQANA3diZyFfX3diZ19ieXRlTGVuZ3RoXzVkNjIzYmEzZDkyYTNhOWMADQN3YmccX193YmdfY2xvc2VfN2NkYTlkZDkwMTIzMDIxNAAdA3diZxpfX3diZ19uZXdfNzBhMmYyM2QxNTY1YzA0YwAbA3diZx1fX3diZ19idWZmZXJfOTUxMDJkZjU1NTQ2NDZkYwAMA3diZyFfX3diZ19ieXRlT2Zmc2V0X2VjMDkyODE0M2M2MTljZDcADQN3YmcnX193Ymdfc2V0aGlnaFdhdGVyTWFya18xMGE5YzViY2RhYTU0MDQ0AEcDd2JnMl9fd2JnX25ld3dpdGhpbnRvdW5kZXJseWluZ3NvdXJjZV9kYjMxOGU2YjkzZGZmYTliABUDd2JnIV9fd2JnX3NldFRpbWVvdXRfMmNiNmM3OTNjNGFhNDRmOABIA3diZyJfX3diZ19wZXJmb3JtYW5jZV9mZmM0ZTgxNWRmYjM0NDlmAAwDd2JnGl9fd2JnX25vd184Nzk5YmUwMmJhODFhMjJlAC8Dd2JnKV9fd2JnX2luc3RhbmNlb2ZfSGVhZGVyc19iMjNhZDEzOGY0Y2UwNDFlAA0Dd2JnHl9fd2JnX3Jlc3BvbmRfZmZiNjkyOGNkOWI3OWMzMgAmA3diZyJfX3diZ19yZWxlYXNlTG9ja18zMmMzMTBkN2JlMzM0ZTFjAB0Dd2JnHF9fd2JnX2Nsb3NlXzllM2I3NDNjNTI4YThkMzEAHQN3YmcdX193YmluZGdlbl9jbG9zdXJlX3dyYXBwZXI0MTQAHgN3YmcdX193YmluZGdlbl9jbG9zdXJlX3dyYXBwZXI0MTYAHgN3YmcdX193YmluZGdlbl9jbG9zdXJlX3dyYXBwZXI0MTgAHgN3YmceX193YmluZGdlbl9jbG9zdXJlX3dyYXBwZXIxMzM0AB4Dd2JnHl9fd2JpbmRnZW5fY2xvc3VyZV93cmFwcGVyNDA2NwAeA3diZx9fX3diaW5kZ2VuX2luaXRfZXh0ZXJucmVmX3RhYmxlAB8DixiJGAcCBwICBAIEAggFMwIDBDQFBAQDAgIDAgMCBScENgcFAgUFBAUCAgQFAgUEBQMCBQIFBgICAwUBBAQHAggFAwICBQUDAgIFBQIEBRIhBQMKAgUCBAMCCAgFAQUCBw4DBwIFBAQFBAQEBAcDAwUCBAIEAgICAwQFAwIEAygEBQIDBEkFBQADBAIDBAMDBQIDAQIFAgECBQkCBAMCBAU4AQ4ABQICAQECBAMCBAQCAgcDAg4CAgICCAsCBTgDAQIFCQQPAwASAQcIAwIDBQgHBAMCAQQEBAQCAw8CBEoAAgADBwIEAwMCAwEEBAMFBQICAgUGBBIPBQEFAwMFAQsFBQMSBQMDBwMCAwMDAgEID0sCAwcHAgMCAgMDAQMHAwMDAwMFAAMEAgIDAgUCDgICAgECAgIEAgIBBQUPEQcHAgMCDwMJBAQCAgIDAwURAjkEAwMFBQIBAwEGAwQPAgQCAwIQAgQJAgICAwooKQACAgQBAgMHAwIEBQUCBAUCAgUBAAMJAxoHAgMEBQMEAgQRBQQOAwIFAgQFBQQCATMRBAMAIgQDAgMCAgEBBAICBQQEBg4IBAIDAwUEAwICAQUDAgQEAwIDAgMFAwMCAgICAgcAAwUHAwQDAwICAgMHAQkBEQIDEQgCBwUEAgMDAgUCBQICNAoCAgMiBTUEAgUDAgMCAwcFBAMDAgICAw8BBAQHKggEBQMEAQUJAgICAgICBAUCAgIDBgMBCAMEAwMEAQICBwICAgMCAQMFAwICAzoCEjoCAQECAwAEAQEDAgYDNwkPBAMPAwMHEkwBBQUGBQICAgEIBgELAgMFAwMCAwMCAwMDBQMDAgMDJwICAgMFAwMEAAQDBgMGAwoDBAIEAwADAwMCBAIQBQIrOwgDAwMCAwEHAQIFAgIFGgQEAgEFAgcDCAQDAgMCBwQDOwIGCQQEBAECAQEFBAMLCAEDAwUDAgQBDwEIAQUBAwICAwsFBQgICAAPAgYCBQQCAwYDDgIDAwICAwQDAwMDBAQGAgICAgMCBgUDAQEDBwcFBgQFB00EAwMEBAQEAwMBAgUCAgICAgQJAwMDAgMECgsBGgMCAgQEBAM2BwIBAQUHAwUFAgEBAgEEBAEBAQIEBAMCBAIDBwQGAgQHCwcHAgIFBwMEBQMEAwEEAQIDBwMCBQICAwIFBgIDBA4DAQMEAwQDKAUCAwMFAgMDAwgHBQMDAxgGBQQDAgIBAwMCBwkEBQUBAwEDAQROAgIBAQUDAgEBTwQCAwMCAQEBAgEBBBAABQMCCwMDAQECAwEDUAEBAQEGBwIDAwMDAwEBAQMDAwMBAQMCAwMDAwECBQIDAwIBBgUBAwQCAgIDAQEBBQUBAzwDAgUAAgICBgEBAgEDBAQBCAMEAgEACAMBBAMDUQcDAQIDAgMSAwMCAQUCAQMBAwIKAQoCAgMCAwECAgICAgQDAgUDAwMCAgUDBAQDAQoEBAEBAgkFBAIEBAMCAgQDAwQFAwMBAQIDCwYCCwMDBwEDAgQGAQErAgI8BQQDAgIAAAACAgEDAwADAwYGBwUDBAMBAwUECAICIgMBBAMDBQUCBwUBAwEABAYCAgIDAwMDBQcFAwMDAwMPAwEEAQEGBwIqAwMEAgICAQYCBQcDAgMCBQEBAz0EAwUFDgEGCwkCGgoEAwI+AQEDAQQBAwIEBQMBAAIEBAECAwEGBQADAQIDAQMDBAgAAwQEAwMCA1IDBAUBAwIBAQYOAgEDBQICBAMCAgYDAgADAgQEBAMBAQICAwMCDgQDAgYKAQQEBAQFEAMABQEGBgIGAgoBBAQDBQIFBAEBAwIDAQMDAwIBAwEBAgQABAQCBAsEAwUBAgEEAQICAgYDEAICAwQDAwMDAwEDAgIDAQEDBwM/AgIDAQUBAQYDCQIDAQMCAgMGAQEBBgYDAQEBAQEBBAgGAwEEAwQEBAQFBAEDBQMDBQQDBAEEAQEBAgMBBQcAAwMABgQCAQEGAwMEBAEGBQYBAQIBAwMBAQMBAwQBAQIDBAABAwQDBgMDAwQAAAYDAwMBAQcDAQEEAgIECAQEAQQBAQEBBAICCQMDAgQBAgMBAwEBAx8DBgMGBgYGBgYGBgYGBAEDBQcEAQEBBh8DAgYEAwIEAQMDAwMDAwEFAgEFCwACAQMfBAEBAgMCAwIBBAEBAQEBAQEBAQYCBgYEAAUDBAQEBg4FBQUCBgEDAQEBAQEECQYCAioDBgIDAgQBAQUBAgQDAwMDIgQEBAMCCgMEBAEJAQYCAQE+AQEDBAYDIwQDAwEBAQEBAQMDBgEDAgMHCgMDAwMDAwMDAwEDAgIDAxEBAQIEAwEDBgQBBQIDBAQBAwMDAgMDBQYEBAQGAQEEAwYkAQEBAQEIAgQCBAMFATIABgMEBwQEBgMBAQMEAAMGAQUFBQIDAQEDAgEABAMEBAEBAQEBAQMEBAQYBAQEAwMDBAUDBQUBBAQBAQEBCAMDAwYBBAECBAECAxEBA1MBBAgCAQEBAQYBAQMCBgMGAQMFAwYDBQMCAwEDAwMBAQEBAgNUEQMCAgEBAgEBAQEBAwEBAQEBAQEBAQMBBgIRGBgYBAMBAwIABwARAQQDAwEBAQEBAQQDBAEEAQEBAQEBAgICAgICAgICAgICAQEBAQEBAQEEBAQEBgEGBAQEBAYEBAEHBAECBAYEAAEBAgICAgIBAgIDAwEBA1VWBAEBAwEDAAEBAQEBBQEBAwMGAwMEAgICAggEAwQDBAQBBAMDAQEBAQQBAwEBAQEDAQMBBgMGAgEGOQEBBgEBAQEBAQEBAQEBAQEBAQEBBAEGAgMDBAIBAwEBAwEBAQEDAQEDAQEBAQMBAwMBAQEBAQMDAQEDAQEDAQMBAQMBAQEBAQEBAwEEBAQDAQUDAQEBAQIHAwMDAwEDAQMYAQMBAwMDAwEBAQEBAwMBAwEBVyAgICAgBgECBAEBAwQEBAFAAwEDAgIDAQIDAwYCAgESAQEBBAEBAwIDAgEDAQEHCAUBAQgBAQEBAQEBAQEGBgMBCgEJBAFYWQcKWwUHAQMGAQEBAQMBAQEEAQEBAQEBAQEBAQEBAQEDBAEBAQEEBAEJCQEBBQsBCQkBAwUBAwUBXQMQAQIBAQIGAQEBAQEEBgUHBAQABAMDAycCAwIBDgECAgExAwMEAgEBBQEBAQMBAQEBAQQBAgEEBQ8BAQEDAgAEABUVFRUVFRUVBAEDAwEGAwMBAQEGBAYBAQEBAQECAQEBAQEBAQEHAxAQEAEBAQMBBAYBAQEIAAgIBQEFBAEBAQECAQMkAQMBAwQEBAEEAQEEAQEBAQEBAQEBARgEBAECAQQDBAULCwMEAQEBAQEDBAUFBAYEBl4DAQEBAwMBQQEBAQEDAwMBAwEBBAQEAAEBBAEBAQEBAQEBAQEBAUEBAQEBAQEBAQEBAQEBAQEBAQEBAwQBAQQEAQEBAQQEBAQEBAQEBAQEAQIKCgQEBAMBAQECAgMCAQMBBAQBAQQEAQEEAgEDBgQBBAFCQgEBAQMBAQEDAQQBBgYBAQEBBAQBAQEBAQEBAQEGAQEBCAgIBAEBAQICAgEDAQEDAwEBAQEBIyMjAQECAhAQEBMTExMTAgEBBAYBAQMBAwMBAQEBAQEBAQEQAQEBAQMDAwMDAwMDAwMDAwMEEAMDAwMDAgMHAwEDAwQFBQUFBQUFAwMDAwMDAwMDAwMEAwMDAwMDAwEDAwMDAAMIBQUDAg4DBAMDBAMDAwMDAwMDAwMDAwMDAwMBAxERAwEDAwEDAwMDAwMDAwEGAhQUFBQUFAEDAxAFBAMBAQEBAQEkBgAkAQQGBgQEAwMBAgIAAAQEAAICAgEDAwYDAwMDAQMfBgYGBAYGBAQEBAQEBAQEBAQEAQEBAQMEBAQEBAQEAgIEBAQDBQUEBAYQBAQEBAQDBAMDBAQCAAMDAgYEBAQEBgEBAQMBAQEGAQQCAQIDAgIDAwMCIQYCAgQEBgQGBAQGBgYDDwIBAwEGBgEBAQEBAQEGKSkBAQEGBgYEAAYACgQBAgsKAgUHCAIFBwUHAgAICQMCAAUKBwcAAgUCCgIKAgUCAwUDAl8GDmAFAgoACghhYj0SDgkJYwIIAgACAAUKKwACBQVkCRIICAQLAnAB1wfXB28AgAEFAwEAFgYJAX8BQYCAwAALB9sXUQZtZW1vcnkCABlfX3diZ19lcG94eXdlYnNvY2tldF9mcmVlAPsGE2Vwb3h5d2Vic29ja2V0X3NlbmQAyxMUZXBveHl3ZWJzb2NrZXRfY2xvc2UAwBQdX193YmdfZXBveHljbGllbnRvcHRpb25zX2ZyZWUA1AgkX193YmdfZ2V0X2Vwb3h5Y2xpZW50b3B0aW9uc193aXNwX3YyAJMNJF9fd2JnX3NldF9lcG94eWNsaWVudG9wdGlvbnNfd2lzcF92MgCxDTNfX3diZ19nZXRfZXBveHljbGllbnRvcHRpb25zX3VkcF9leHRlbnNpb25fcmVxdWlyZWQAlA0zX193Ymdfc2V0X2Vwb3h5Y2xpZW50b3B0aW9uc191ZHBfZXh0ZW5zaW9uX3JlcXVpcmVkALINL19fd2JnX2dldF9lcG94eWNsaWVudG9wdGlvbnNfdGl0bGVfY2FzZV9oZWFkZXJzAJUNL19fd2JnX3NldF9lcG94eWNsaWVudG9wdGlvbnNfdGl0bGVfY2FzZV9oZWFkZXJzALMNMl9fd2JnX2dldF9lcG94eWNsaWVudG9wdGlvbnNfd3NfdGl0bGVfY2FzZV9oZWFkZXJzAJYNMl9fd2JnX3NldF9lcG94eWNsaWVudG9wdGlvbnNfd3NfdGl0bGVfY2FzZV9oZWFkZXJzALQNMF9fd2JnX2dldF9lcG94eWNsaWVudG9wdGlvbnNfd2Vic29ja2V0X3Byb3RvY29scwCIEjBfX3diZ19zZXRfZXBveHljbGllbnRvcHRpb25zX3dlYnNvY2tldF9wcm90b2NvbHMAhgorX193YmdfZ2V0X2Vwb3h5Y2xpZW50b3B0aW9uc19yZWRpcmVjdF9saW1pdACXDStfX3diZ19zZXRfZXBveHljbGllbnRvcHRpb25zX3JlZGlyZWN0X2xpbWl0AIAOKV9fd2JnX2dldF9lcG94eWNsaWVudG9wdGlvbnNfaGVhZGVyX2xpbWl0AJgNKV9fd2JnX3NldF9lcG94eWNsaWVudG9wdGlvbnNfaGVhZGVyX2xpbWl0AIEOJ19fd2JnX2dldF9lcG94eWNsaWVudG9wdGlvbnNfdXNlcl9hZ2VudACJEidfX3diZ19zZXRfZXBveHljbGllbnRvcHRpb25zX3VzZXJfYWdlbnQAtgkmX193YmdfZ2V0X2Vwb3h5Y2xpZW50b3B0aW9uc19wZW1fZmlsZXMAihImX193Ymdfc2V0X2Vwb3h5Y2xpZW50b3B0aW9uc19wZW1fZmlsZXMAhwo7X193YmdfZ2V0X2Vwb3h5Y2xpZW50b3B0aW9uc19kaXNhYmxlX2NlcnRpZmljYXRlX3ZhbGlkYXRpb24AmQ07X193Ymdfc2V0X2Vwb3h5Y2xpZW50b3B0aW9uc19kaXNhYmxlX2NlcnRpZmljYXRlX3ZhbGlkYXRpb24AtQ0oX193YmdfZ2V0X2Vwb3h5Y2xpZW50b3B0aW9uc19idWZmZXJfc2l6ZQCaDShfX3diZ19zZXRfZXBveHljbGllbnRvcHRpb25zX2J1ZmZlcl9zaXplAIIOHmVwb3h5Y2xpZW50b3B0aW9uc19uZXdfZGVmYXVsdACuCBhfX3diZ19lcG94eWhhbmRsZXJzX2ZyZWUAjAkeX193YmdfZ2V0X2Vwb3h5aGFuZGxlcnNfb25vcGVuAP4WHl9fd2JnX3NldF9lcG94eWhhbmRsZXJzX29ub3BlbgD0FR9fX3diZ19nZXRfZXBveHloYW5kbGVyc19vbmNsb3NlAP8WH19fd2JnX3NldF9lcG94eWhhbmRsZXJzX29uY2xvc2UA9RUfX193YmdfZ2V0X2Vwb3h5aGFuZGxlcnNfb25lcnJvcgCAFx9fX3diZ19zZXRfZXBveHloYW5kbGVyc19vbmVycm9yAPYVIV9fd2JnX2dldF9lcG94eWhhbmRsZXJzX29ubWVzc2FnZQCBFyFfX3diZ19zZXRfZXBveHloYW5kbGVyc19vbm1lc3NhZ2UA9xURZXBveHloYW5kbGVyc19uZXcA4A8WX193YmdfZXBveHljbGllbnRfZnJlZQDeBiRfX3diZ19nZXRfZXBveHljbGllbnRfcmVkaXJlY3RfbGltaXQAmw0kX193Ymdfc2V0X2Vwb3h5Y2xpZW50X3JlZGlyZWN0X2xpbWl0ANIOIF9fd2JnX2dldF9lcG94eWNsaWVudF91c2VyX2FnZW50AIsSIF9fd2JnX3NldF9lcG94eWNsaWVudF91c2VyX2FnZW50ALcJIV9fd2JnX2dldF9lcG94eWNsaWVudF9idWZmZXJfc2l6ZQCcDSFfX3diZ19zZXRfZXBveHljbGllbnRfYnVmZmVyX3NpemUA0w4PZXBveHljbGllbnRfbmV3ANgQI2Vwb3h5Y2xpZW50X3JlcGxhY2Vfc3RyZWFtX3Byb3ZpZGVyAIIXHWVwb3h5Y2xpZW50X2Nvbm5lY3Rfd2Vic29ja2V0ANcQF2Vwb3h5Y2xpZW50X2Nvbm5lY3RfdGNwAMwTF2Vwb3h5Y2xpZW50X2Nvbm5lY3RfdGxzAM0TF2Vwb3h5Y2xpZW50X2Nvbm5lY3RfdWRwAM4TEWVwb3h5Y2xpZW50X2ZldGNoAIcSHHJpbmdfY29yZV8wXzE3XzhfYm5fbXVsX21vbnQAwwUjX193YmdfaW50b3VuZGVybHlpbmdieXRlc291cmNlX2ZyZWUAqA0daW50b3VuZGVybHlpbmdieXRlc291cmNlX3R5cGUAjBIuaW50b3VuZGVybHlpbmdieXRlc291cmNlX2F1dG9BbGxvY2F0ZUNodW5rU2l6ZQDZDh5pbnRvdW5kZXJseWluZ2J5dGVzb3VyY2Vfc3RhcnQA+BUdaW50b3VuZGVybHlpbmdieXRlc291cmNlX3B1bGwAzxMfaW50b3VuZGVybHlpbmdieXRlc291cmNlX2NhbmNlbACEER9fX3diZ19pbnRvdW5kZXJseWluZ3NvdXJjZV9mcmVlAOIMGWludG91bmRlcmx5aW5nc291cmNlX3B1bGwA0BMbaW50b3VuZGVybHlpbmdzb3VyY2VfY2FuY2VsAJEQHV9fd2JnX2ludG91bmRlcmx5aW5nc2lua19mcmVlAIUTGGludG91bmRlcmx5aW5nc2lua193cml0ZQDRExhpbnRvdW5kZXJseWluZ3NpbmtfY2xvc2UAgxcYaW50b3VuZGVybHlpbmdzaW5rX2Fib3J0ANITEV9fd2JpbmRnZW5fbWFsbG9jAMENEl9fd2JpbmRnZW5fcmVhbGxvYwCrDxNfX3diaW5kZ2VuX2V4cG9ydF8yAQETX193YmluZGdlbl9leHBv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
				),
				(c) => c.charCodeAt(0),
			);
			if (wasm !== void 0) return;
			if (typeof module_or_path !== "undefined") {
				if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
					({ module_or_path } = module_or_path);
				} else {
					console.warn(
						"using deprecated parameters for the initialization function; pass a single object instead",
					);
				}
			}
			if (typeof module_or_path === "undefined") {
				module_or_path = new URL("epoxy.wasm", import_meta.url);
			}
			const imports = __wbg_get_imports();
			if (
				typeof module_or_path === "string" ||
				(typeof Request === "function" &&
					module_or_path instanceof Request) ||
				(typeof URL === "function" && module_or_path instanceof URL)
			) {
				module_or_path = fetch(module_or_path);
			}
			__wbg_init_memory(imports);
			const { instance, module: module2 } = await __wbg_load(
				await module_or_path,
				imports,
			);
			__wbg_finalize_init(instance, module2);
		}
		var epoxy_bundled_default = __wbg_init;
		var info = { version: "2.1.15-1", minimal: false, release: true };

		
		var opts = [
			"wisp_v2",
			"udp_extension_required",
			"title_case_headers",
			"ws_title_case_headers",
			"wisp_ws_protocols",
			"redirect_limit",
			"header_limit",
			"buffer_size",
		];
		var EpoxyTransport = class {
			canstart = true;
			ready = false;
			client_version;
			client = null;
			wisp;
			opts;
			constructor(opts2) {
				this.wisp = opts2.wisp;
				this.opts = opts2;
				this.client_version = info;
			}
			setopt(opts2, opt) {
				if (this.opts[opt] != null) opts2[opt] = this.opts[opt];
			}
			async init() {
				await epoxy_bundled_default();
				let options = new EpoxyClientOptions();
				options.user_agent = navigator.userAgent;
				opts.forEach((x) => this.setopt(options, x));
				this.client = new EpoxyClient(this.wisp, options);
				this.ready = true;
			}
			async meta() {}
			async request(remote, method, body, headers, signal) {
				if (body instanceof Blob) body = await body.arrayBuffer();
				try {
					let res = await this.client.fetch(remote.href, {
						method,
						body,
						headers,
						redirect: "manual",
					});
					return {
						body: res.body,
						headers: res.rawHeaders,
						status: res.status,
						statusText: res.statusText,
					};
				} catch (err) {
					console.error(err);
					throw err;
				}
			}
			connect(
				url,
				protocols,
				requestHeaders,
				onopen,
				onmessage,
				onclose,
				onerror,
			) {
				let handlers = new EpoxyHandlers(
					onopen,
					onclose,
					onerror,
					(data) =>
						data instanceof Uint8Array
							? onmessage(data.buffer)
							: onmessage(data),
				);
				let ws = this.client.connect_websocket(
					handlers,
					url.href,
					protocols,
					Object.assign(requestHeaders),
				);
				return [
					async (data) => {
						if (data instanceof Blob) data = await data.arrayBuffer();
						(await ws).send(data);
					},
					async (code, reason) => {
						(await ws).close(code, reason || "");
					},
				];
			}
		};

		if (__exports != exports) module.exports = exports;
		return module.exports;
	},
);

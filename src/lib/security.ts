import { isTrustedOrigin } from "./network";
import { json } from "./http/response";

export function rejectIfCrossOrigin(request: Request): Response | null {
	if (isTrustedOrigin(request)) {
		return null;
	}

	return json({ error: "Cross-origin request blocked" }, { status: 403 });
}

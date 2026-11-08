import { CreateBarberPayload, UpdateBarberPayload } from "../model/barber.model";

/** Fields shared by create and edit. `Image` is only appended when a file was chosen. */
function baseFormData(p: CreateBarberPayload): FormData {
  const body = new FormData();
  body.append("BranchId", String(p.branchId));
  body.append("FullName", p.fullName.trim());
  body.append("Phone", p.phone.trim());
  if (p.image) body.append("Image", p.image, p.image.name);
  return body;
}

/**
 * Multipart body for POST /barbers.
 * The backend binds PascalCase form fields (BranchId, FullName, Phone, Image).
 */
export function buildCreateBarberFormData(payload: CreateBarberPayload): FormData {
  return baseFormData(payload);
}

/**
 * Multipart body for PUT /barbers/{id}.
 *
 * Photo contract: send `Image` to replace · `RemoveImage=true` with NO image to remove ·
 * neither to keep the current photo. A chosen image always wins, so `RemoveImage` is
 * only ever "true" when there is no new file; otherwise it is the literal "false".
 */
export function buildUpdateBarberFormData(payload: UpdateBarberPayload): FormData {
  const body = baseFormData(payload);
  body.append("RemoveImage", String(payload.removeImage && !payload.image));
  return body;
}

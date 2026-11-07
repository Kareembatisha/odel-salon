import { CreateOfferPayload, UpdateOfferPayload } from "../model/offer.model";

/** A nullable field goes out EMPTY when unset — the contract's way to say `null` in multipart. */
const orEmpty = (value: number | string | null): string => (value === null ? "" : String(value));

/** Fields shared by create and edit. `Image` is only appended when a file was chosen. */
function baseFormData(body: FormData, p: UpdateOfferPayload | CreateOfferPayload): FormData {
  body.append("NameAr", p.nameAr.trim());
  body.append("NameEn", p.nameEn.trim());
  // `serviceIds` is a repeated field: ServiceIds=1, ServiceIds=2, …
  p.serviceIds.forEach((id) => body.append("ServiceIds", String(id)));
  body.append("RegularPrice", String(p.regularPrice));
  body.append("VipPrice", String(p.vipPrice));
  body.append("HomePrice", orEmpty(p.homePrice));
  body.append("StartDate", p.startDate);
  body.append("EndDate", orEmpty(p.endDate));
  body.append("MaxBookings", orEmpty(p.maxBookings));
  if (p.image) body.append("Image", p.image, p.image.name);
  return body;
}

/**
 * Multipart body for POST /offers.
 * The backend binds PascalCase form fields (like Barbers): BranchId, NameAr, NameEn, ServiceIds
 * (repeated), RegularPrice, VipPrice, HomePrice, StartDate, EndDate, MaxBookings, Image.
 */
export function buildCreateOfferFormData(payload: CreateOfferPayload): FormData {
  const body = new FormData();
  body.append("BranchId", String(payload.branchId));
  return baseFormData(body, payload);
}

/**
 * Multipart body for PUT /offers/{id}.
 *
 * Banner contract: send `Image` to replace · `RemoveImage=true` with NO image to remove ·
 * neither to keep the current banner. A chosen image always wins, so `RemoveImage` is only
 * ever "true" when there is no new file; otherwise it is the literal "false".
 */
export function buildUpdateOfferFormData(payload: UpdateOfferPayload): FormData {
  const body = baseFormData(new FormData(), payload);
  body.append("RemoveImage", String(payload.removeImage && !payload.image));
  return body;
}

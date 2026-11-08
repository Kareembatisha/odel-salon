import { UpdateProfileRequest } from "../model/profile.model";

/**
 * Builds the multipart body for PUT /auth/profile.
 * The backend binds PascalCase form fields (FullName, Email, CountryCode,
 * PhoneNumber, Image, RemoveImage); `Image` is only appended when a new file
 * was chosen, and `RemoveImage` is always sent as the literal "true"/"false".
 */
export function buildProfileFormData(req: UpdateProfileRequest): FormData {
  const body = new FormData();
  body.append("FullName", req.fullName.trim());
  body.append("Email", req.email.trim());
  body.append("CountryCode", req.countryCode);
  body.append("PhoneNumber", req.phoneNumber.trim());
  if (req.image) body.append("Image", req.image, req.image.name);
  body.append("RemoveImage", String(req.removeImage));
  return body;
}

/**
 * profile.model.ts — data contracts for the Profile feature.
 * Mirrors API_Contract_Authentication.md §5 (PUT /auth/profile) and §6 (GET /auth/profile).
 */

/** GET /auth/profile → data */
export interface UserProfile {
  id: number;
  fullName: string;
  email: string;
  /** Dial code with the plus sign, e.g. "+20". */
  countryCode: string;
  /** National number without the dial code, e.g. "1029005195". */
  phoneNumber: string;
  role: string;
  /** null when the user has no profile image. */
  imageUrl: string | null;
}

/**
 * PUT /auth/profile — sent as multipart/form-data (see buildProfileFormData).
 * Camel-case here for the app; the wire format is PascalCase.
 */
export interface UpdateProfileRequest {
  fullName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  /** New photo. Omit to keep the current one. */
  image?: File | null;
  /** true deletes the current photo. */
  removeImage: boolean;
}

// UpdateProfileResponse data is always null — the service refetches GET /auth/profile instead.

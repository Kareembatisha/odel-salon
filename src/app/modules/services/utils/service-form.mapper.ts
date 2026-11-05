import { FormBuilder, FormGroup } from "@angular/forms";

import {
  ServiceBranchPayload,
  ServiceBranchPricing,
  ServiceDetails,
  ServicePayload,
} from "../model/service.model";
import { branchesArray, createBranchPricingGroup } from "./service-form.factory";

/** Raw value of one branch group (numbers as text). */
export interface BranchPricingFormValue {
  branchId: number;
  durationMinutes: string;
  regularPrice: string;
  vipPrice: string;
  isHomeAvailable: boolean;
  homePrice: string;
  isActive: boolean;
}

export interface ServiceFormValue {
  nameAr: string;
  nameEn: string;
  branches: BranchPricingFormValue[];
}

const text = (value: number | null): string => (value === null ? "" : String(value));

/**
 * Fill the form from the branches the page shows. A branch with no price yet (`isPriced`
 * false — and every branch of a NEW service) starts blank but active, so the user only has to
 * type the numbers.
 */
export function applyBranchesToForm(
  fb: FormBuilder,
  form: FormGroup,
  branches: ServiceBranchPricing[],
): void {
  const array = branchesArray(form);
  array.clear();

  for (const branch of branches) {
    const group = createBranchPricingGroup(fb, branch.branchId);
    if (branch.isPriced) {
      group.patchValue({
        durationMinutes: text(branch.durationMinutes),
        regularPrice: text(branch.regularPrice),
        vipPrice: text(branch.vipPrice),
        isHomeAvailable: branch.isHomeAvailable,
        homePrice: text(branch.homePrice),
        isActive: branch.isActive,
      });
    }
    array.push(group);
  }
}

/** Edit mode: names + every branch's current prices. */
export function applyServiceToForm(
  fb: FormBuilder,
  form: FormGroup,
  service: ServiceDetails,
): void {
  form.patchValue({ nameAr: service.nameAr, nameEn: service.nameEn });
  applyBranchesToForm(fb, form, service.branches);
}

/**
 * Form → POST / PUT body. Names are trimmed; `homePrice` is `null` unless the branch is
 * available at home (the contract rejects a home price otherwise).
 */
export function buildServicePayload(value: ServiceFormValue): ServicePayload {
  return {
    nameAr: value.nameAr.trim(),
    nameEn: value.nameEn.trim(),
    branches: value.branches.map(
      (b): ServiceBranchPayload => ({
        branchId: b.branchId,
        durationMinutes: Number(b.durationMinutes),
        regularPrice: Number(b.regularPrice),
        vipPrice: Number(b.vipPrice),
        isHomeAvailable: b.isHomeAvailable,
        homePrice: b.isHomeAvailable ? Number(b.homePrice) : null,
        isActive: b.isActive,
      }),
    ),
  };
}

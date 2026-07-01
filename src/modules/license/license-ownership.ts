export type LicenseOwnershipType = 'INDIVIDUAL' | 'JURISTIC';

type BusinessOwnershipSource = {
  ownerUserId?: string | null;
  owner?: { fullName: string } | null;
  juristicPersonId?: string | null;
  juristicPerson?: {
    nameTh: string;
    registrationId: string;
  } | null;
};

type OwnershipOptions = {
  exposeIndividualContext?: boolean;
};

export function buildLicenseOwnership(
  business: BusinessOwnershipSource,
  options: OwnershipOptions = {},
) {
  if (business.juristicPersonId) {
    return {
      type: 'JURISTIC' as LicenseOwnershipType,
      labelTh: 'นิติบุคคล',
      contextId: business.juristicPersonId,
      displayNameTh: business.juristicPerson?.nameTh ?? 'นิติบุคคล',
      registrationId: business.juristicPerson?.registrationId ?? null,
    };
  }

  // TODO(schema): add a holder type or check constraint if mixed holder rows become invalid in production.
  return {
    type: 'INDIVIDUAL' as LicenseOwnershipType,
    labelTh: 'บุคคลธรรมดา',
    contextId: options.exposeIndividualContext
      ? (business.ownerUserId ?? null)
      : null,
    displayNameTh: options.exposeIndividualContext
      ? (business.owner?.fullName ?? 'บุคคลธรรมดา')
      : 'บุคคลธรรมดา',
    registrationId: null,
  };
}

import { buildLicenseOwnership } from './license-ownership';

describe('license ownership metadata', () => {
  it('returns individual ownership without exposing context by default', () => {
    expect(
      buildLicenseOwnership({
        ownerUserId: 'user-1',
        owner: { fullName: 'สมชาย ใจดี' },
        juristicPersonId: null,
      }),
    ).toEqual({
      type: 'INDIVIDUAL',
      labelTh: 'บุคคลธรรมดา',
      contextId: null,
      displayNameTh: 'บุคคลธรรมดา',
      registrationId: null,
    });
  });

  it('returns individual ownership context for self-service responses', () => {
    expect(
      buildLicenseOwnership(
        {
          ownerUserId: 'user-1',
          owner: { fullName: 'สมชาย ใจดี' },
        },
        { exposeIndividualContext: true },
      ),
    ).toMatchObject({
      type: 'INDIVIDUAL',
      contextId: 'user-1',
      displayNameTh: 'สมชาย ใจดี',
    });
  });

  it('prioritizes juristic ownership when a juristic person exists', () => {
    expect(
      buildLicenseOwnership({
        ownerUserId: 'legacy-owner',
        juristicPersonId: 'jp-1',
        juristicPerson: {
          nameTh: 'บริษัท ตัวอย่าง จำกัด',
          registrationId: '0105559000000',
        },
      }),
    ).toEqual({
      type: 'JURISTIC',
      labelTh: 'นิติบุคคล',
      contextId: 'jp-1',
      displayNameTh: 'บริษัท ตัวอย่าง จำกัด',
      registrationId: '0105559000000',
    });
  });
});

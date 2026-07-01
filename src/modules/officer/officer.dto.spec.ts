import { ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { CreateOfficerInspectionDto } from './officer.dto';

describe('Officer DTOs', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateOfficerInspectionDto,
  };

  it('accepts legacy item result without requiring pass/fail selection', async () => {
    await expect(
      pipe.transform(
        {
          businessId: '1b2c3d4e-1111-4222-8333-123456789abc',
          inspectedAt: '2026-07-02T09:00:00.000Z',
          items: [
            {
              licenseId: '2b2c3d4e-1111-4222-8333-123456789abc',
              result: '',
              detailNote: 'ตรวจสอบเอกสารแล้ว',
            },
          ],
        },
        metadata,
      ),
    ).resolves.toBeInstanceOf(CreateOfficerInspectionDto);
  });
});

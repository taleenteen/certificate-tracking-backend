import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateLicenseDocumentExportDto {
  /** File format. PDF is intended for printing; XLSX and CSV contain tabular data. */
  @IsIn(['pdf', 'xlsx', 'csv'])
  format!: 'pdf' | 'xlsx' | 'csv';

  /** License ids under the selected establishment. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  licenseIds!: string[];

  /** Native Tang Rat clients receive a short-lived private download URL. */
  @IsOptional()
  @IsIn(['native'])
  delivery?: 'native';
}

export class LicenseDocumentExportQueryDto extends PaginationDto {
  /** Filter history to one establishment. */
  @IsOptional()
  @IsUUID()
  businessId?: string;

  /** Search by the reference printed in the exported document. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  referenceNo?: string;
}

import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtClaims } from '../../common/auth.types';
import { MyService } from './my.service';

class MyLicensesQuery {
  /**
   * `personal` = licenses of a business the user owns; `juristic` = licenses of
   * the user's registered juristic person (mock DBD lookup).
   */
  @ApiPropertyOptional({ enum: ['personal', 'juristic'], default: 'personal' })
  @IsIn(['personal', 'juristic'])
  mode: 'personal' | 'juristic' = 'personal';
}

@ApiTags('My')
@ApiBearerAuth('access-token')
@Controller('my')
export class MyController {
  constructor(private readonly myService: MyService) {}

  @ApiOperation({
    summary: 'My licenses',
    description:
      'Returns the current user’s licenses. In `juristic` mode, a 404 with ' +
      '`{ found: false }` is returned when no juristic match exists.',
  })
  @ApiOkResponse({ description: 'Licenses for the selected mode.' })
  @Get('licenses')
  licenses(@CurrentUser() user: JwtClaims, @Query() query: MyLicensesQuery) {
    if (query.mode === 'personal') {
      return this.myService.getLicensesPersonal(user.sub);
    }
    return this.myService.getLicensesJuristic(user);
  }
}

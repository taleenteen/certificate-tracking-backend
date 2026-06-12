import { Controller, Get, Query } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtClaims } from '../../common/auth.types';
import { MyService } from './my.service';

class MyLicensesQuery {
  @IsIn(['personal', 'juristic'])
  mode: 'personal' | 'juristic' = 'personal';
}

@Controller('my')
export class MyController {
  constructor(private readonly myService: MyService) {}

  @Get('licenses')
  licenses(@CurrentUser() user: JwtClaims, @Query() query: MyLicensesQuery) {
    if (query.mode === 'personal') {
      return this.myService.getLicensesPersonal(user.sub);
    }
    return this.myService.getLicensesJuristic(user);
  }
}

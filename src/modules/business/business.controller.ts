import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { BusinessQueryDto, MapQueryDto } from './business.dto';
import { BusinessService } from './business.service';

@Public()
@Controller('businesses')
export class BusinessController {
  constructor(private readonly businesses: BusinessService) {}

  @Get()
  list(@Query() query: BusinessQueryDto) {
    return this.businesses.list(query);
  }

  @Get('map')
  map(@Query() query: MapQueryDto) {
    return this.businesses.map(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.businesses.findOne(id);
  }
}

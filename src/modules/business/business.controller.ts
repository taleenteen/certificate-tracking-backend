import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { BusinessQueryDto, MapQueryDto } from './business.dto';
import { BusinessService } from './business.service';

@ApiTags('Businesses')
@Public()
@Controller('businesses')
export class BusinessController {
  constructor(private readonly businesses: BusinessService) {}

  @ApiOperation({
    summary: 'Search businesses',
    description:
      'Paginated, case-insensitive search on Thai name with optional province ' +
      'filter. Returns `{ data, meta }`.',
  })
  @ApiOkResponse({ description: 'Paginated business list.' })
  @Get()
  list(@Query() query: BusinessQueryDto) {
    return this.businesses.list(query);
  }

  @ApiOperation({
    summary: 'Businesses as a GeoJSON map layer',
    description:
      'Returns a GeoJSON FeatureCollection (Point features) filtered by ' +
      'province / license type code / status. Rows without coordinates are ' +
      'excluded.',
  })
  @ApiOkResponse({ description: 'GeoJSON FeatureCollection.' })
  @Get('map')
  map(@Query() query: MapQueryDto) {
    return this.businesses.map(query);
  }

  @ApiOperation({
    summary: 'Get a business by id',
    description: 'Business detail including its active licenses.',
  })
  @ApiParam({ name: 'id', description: 'Business uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'The business with active licenses.' })
  @ApiNotFoundResponse({ description: 'Business not found.' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.businesses.findOne(id);
  }
}

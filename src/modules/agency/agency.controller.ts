import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateAgencyDto, UpdateAgencyDto } from './agency.dto';
import { AgencyService } from './agency.service';

@ApiTags('Agencies')
@ApiBearerAuth('access-token')
@Controller('agencies')
export class AgencyController {
  constructor(private readonly agencies: AgencyService) {}

  @Public()
  @ApiOperation({
    summary: 'List all agencies',
    description:
      'Returns all agencies (active and inactive) with derived license type count.',
  })
  @ApiOkResponse({ description: 'Array of agency records.' })
  @Get()
  list() {
    return this.agencies.list();
  }

  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Create an agency (admin)',
    description: 'Creates a new agency. The code is immutable after creation.',
  })
  @ApiCreatedResponse({ description: 'The created agency.' })
  @Post()
  create(@Body() dto: CreateAgencyDto) {
    return this.agencies.create(dto);
  }

  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Update an agency (admin)',
    description:
      'Updates agency metadata. The code field is immutable and cannot be changed.',
  })
  @ApiParam({ name: 'id', description: 'Agency UUID', format: 'uuid' })
  @ApiOkResponse({ description: 'The updated agency.' })
  @ApiNotFoundResponse({ description: 'Agency not found.' })
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAgencyDto) {
    return this.agencies.update(id, dto);
  }
}

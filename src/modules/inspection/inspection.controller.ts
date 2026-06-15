import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtClaims } from '../../common/auth.types';
import {
  CancelTaskDto,
  CreateTaskDto,
  ReturnReportDto,
  TaskQueryDto,
  UpdateReportDto,
} from './inspection.dto';
import { InspectionService } from './inspection.service';

@ApiTags('Inspection')
@ApiBearerAuth('access-token')
@Controller()
export class InspectionController {
  constructor(private readonly inspections: InspectionService) {}

  @Roles('inspector', 'supervisor')
  @ApiOperation({
    summary: 'List inspection tasks (scoped)',
    description:
      'Inspector sees tasks assigned to them; supervisor sees tasks in their ' +
      'zones + agency. Optional `status` filter.',
  })
  @ApiOkResponse({
    description: 'Array of tasks with business/license/report.',
  })
  @Get('inspection-tasks')
  list(
    @CurrentUser() user: JwtClaims,
    @Req() request: Request,
    @Query() query: TaskQueryDto,
  ) {
    return this.inspections.list(user, request.scope!, query.status);
  }

  @Roles('inspector', 'supervisor')
  @ApiOperation({
    summary: 'Get an inspection task (scoped)',
    description:
      'Includes business, zone, license, assignee, and the latest report. ' +
      'Returns 404 if outside the caller’s scope.',
  })
  @ApiParam({ name: 'id', description: 'Task uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'The task with related data.' })
  @ApiNotFoundResponse({ description: 'Not found or out of scope.' })
  @Get('inspection-tasks/:id')
  findTask(
    @Param('id') id: string,
    @CurrentUser() user: JwtClaims,
    @Req() request: Request,
  ) {
    return this.inspections.findTask(id, user, request.scope!);
  }

  @Roles('supervisor')
  @ApiOperation({
    summary: 'Create an inspection task (supervisor)',
    description:
      'Assignee must hold the inspector role, share a zone with the business, ' +
      'and match the agency. Rejected (409) if the assignee owns the business ' +
      '(conflict of interest). Generates a sequential `T-YYYY-NNNN` number and ' +
      'notifies the assignee.',
  })
  @ApiCreatedResponse({ description: 'The created task.' })
  @ApiNotFoundResponse({ description: 'Business or assignee not in scope.' })
  @ApiForbiddenResponse({ description: 'Assignee does not cover the zone.' })
  @ApiConflictResponse({
    description: 'Assignee owns the business (conflict of interest).',
  })
  @Post('inspection-tasks')
  createTask(
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: JwtClaims,
    @Req() request: Request,
  ) {
    return this.inspections.createTask(dto, user, request.scope!);
  }

  @Roles('inspector')
  @ApiOperation({
    summary: 'Start a task (assignee)',
    description:
      'Transitions ASSIGNED → IN_PROGRESS, sets `startedAt`, and creates a ' +
      'draft report if none exists.',
  })
  @ApiParam({ name: 'id', description: 'Task uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'The updated task.' })
  @ApiUnprocessableEntityResponse({ description: 'Invalid state transition.' })
  @Patch('inspection-tasks/:id/start')
  startTask(@Param('id') id: string, @CurrentUser() user: JwtClaims) {
    return this.inspections.startTask(id, user);
  }

  @Roles('supervisor')
  @ApiOperation({
    summary: 'Cancel a task (supervisor)',
    description: 'Only from ASSIGNED or IN_PROGRESS. Requires a reason.',
  })
  @ApiParam({ name: 'id', description: 'Task uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'The cancelled task.' })
  @ApiUnprocessableEntityResponse({ description: 'Invalid state transition.' })
  @Patch('inspection-tasks/:id/cancel')
  cancelTask(
    @Param('id') id: string,
    @Body() dto: CancelTaskDto,
    @CurrentUser() user: JwtClaims,
    @Req() request: Request,
  ) {
    return this.inspections.cancelTask(id, dto.reason, user, request.scope!);
  }

  @Roles('inspector')
  @ApiOperation({
    summary: 'Update a draft report (owner)',
    description:
      'Editable only while the report is a draft or the task is RETURNED.',
  })
  @ApiParam({ name: 'id', description: 'Report uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'The updated report.' })
  @ApiUnprocessableEntityResponse({ description: 'Report is not editable.' })
  @Put('inspection-reports/:id')
  updateReport(
    @Param('id') id: string,
    @Body() dto: UpdateReportDto,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.inspections.updateReport(id, user.sub, dto);
  }

  @Roles('inspector')
  @ApiOperation({
    summary: 'Upload evidence file (owner)',
    description:
      'Multipart upload. Max 10 MB; allowed types: image/jpeg, image/png, ' +
      'application/pdf. Stored privately in MinIO under the report.',
  })
  @ApiParam({ name: 'id', description: 'Report uuid', format: 'uuid' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ description: 'The created evidence document.' })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid file or report not editable.',
  })
  @Post('inspection-reports/:id/evidence')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadEvidence(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.inspections.uploadEvidence(id, user.sub, file);
  }

  @Roles('inspector')
  @ApiOperation({
    summary: 'Delete an evidence file (owner)',
    description: 'Allowed only while the report is a draft or RETURNED.',
  })
  @ApiParam({ name: 'id', description: 'Report uuid', format: 'uuid' })
  @ApiParam({ name: 'docId', description: 'Document uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'Deletion result.' })
  @ApiNotFoundResponse({ description: 'Document not found.' })
  @Delete('inspection-reports/:id/evidence/:docId')
  deleteEvidence(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.inspections.deleteEvidence(id, docId, user.sub);
  }

  @Roles('inspector')
  @ApiOperation({
    summary: 'Submit a report (owner)',
    description:
      'Requires a non-null result. Sets the report non-draft, transitions the ' +
      'task to PENDING_REVIEW, and notifies supervisors in the zone + agency.',
  })
  @ApiParam({ name: 'id', description: 'Report uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'The submitted report.' })
  @ApiUnprocessableEntityResponse({
    description: 'Result missing or invalid state transition.',
  })
  @Patch('inspection-reports/:id/submit')
  submitReport(@Param('id') id: string, @CurrentUser() user: JwtClaims) {
    return this.inspections.submitReport(id, user.sub);
  }

  @Roles('supervisor')
  @ApiOperation({
    summary: 'Approve a report (supervisor)',
    description:
      'Transitions the task to APPROVED. Side effects: FAILED result ' +
      'suspends the license; a PASSED result reactivates a previously ' +
      'suspended one. Notifies the inspector.',
  })
  @ApiParam({ name: 'id', description: 'Report uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'The approved report.' })
  @ApiNotFoundResponse({ description: 'Not found or out of scope.' })
  @ApiUnprocessableEntityResponse({ description: 'Invalid state transition.' })
  @Patch('inspection-reports/:id/approve')
  approveReport(
    @Param('id') id: string,
    @CurrentUser() user: JwtClaims,
    @Req() request: Request,
  ) {
    return this.inspections.approveReport(id, user, request.scope!);
  }

  @Roles('supervisor')
  @ApiOperation({
    summary: 'Return a report for fixes (supervisor)',
    description:
      'Requires a review comment. Transitions the task to RETURNED and ' +
      'notifies the inspector.',
  })
  @ApiParam({ name: 'id', description: 'Report uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'The returned report.' })
  @ApiNotFoundResponse({ description: 'Not found or out of scope.' })
  @ApiUnprocessableEntityResponse({ description: 'Invalid state transition.' })
  @Patch('inspection-reports/:id/return')
  returnReport(
    @Param('id') id: string,
    @Body() dto: ReturnReportDto,
    @CurrentUser() user: JwtClaims,
    @Req() request: Request,
  ) {
    return this.inspections.returnReport(
      id,
      dto.reviewComment,
      user,
      request.scope!,
    );
  }
}

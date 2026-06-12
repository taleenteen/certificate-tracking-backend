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

@Controller()
export class InspectionController {
  constructor(private readonly inspections: InspectionService) {}

  @Roles('inspector', 'supervisor')
  @Get('inspection-tasks')
  list(
    @CurrentUser() user: JwtClaims,
    @Req() request: Request,
    @Query() query: TaskQueryDto,
  ) {
    return this.inspections.list(user, request.scope!, query.status);
  }

  @Roles('inspector', 'supervisor')
  @Get('inspection-tasks/:id')
  findTask(
    @Param('id') id: string,
    @CurrentUser() user: JwtClaims,
    @Req() request: Request,
  ) {
    return this.inspections.findTask(id, user, request.scope!);
  }

  @Roles('supervisor')
  @Post('inspection-tasks')
  createTask(
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: JwtClaims,
    @Req() request: Request,
  ) {
    return this.inspections.createTask(dto, user, request.scope!);
  }

  @Roles('inspector')
  @Patch('inspection-tasks/:id/start')
  startTask(@Param('id') id: string, @CurrentUser() user: JwtClaims) {
    return this.inspections.startTask(id, user);
  }

  @Roles('supervisor')
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
  @Put('inspection-reports/:id')
  updateReport(
    @Param('id') id: string,
    @Body() dto: UpdateReportDto,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.inspections.updateReport(id, user.sub, dto);
  }

  @Roles('inspector')
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
  @Delete('inspection-reports/:id/evidence/:docId')
  deleteEvidence(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.inspections.deleteEvidence(id, docId, user.sub);
  }

  @Roles('inspector')
  @Patch('inspection-reports/:id/submit')
  submitReport(@Param('id') id: string, @CurrentUser() user: JwtClaims) {
    return this.inspections.submitReport(id, user.sub);
  }

  @Roles('supervisor')
  @Patch('inspection-reports/:id/approve')
  approveReport(
    @Param('id') id: string,
    @CurrentUser() user: JwtClaims,
    @Req() request: Request,
  ) {
    return this.inspections.approveReport(id, user, request.scope!);
  }

  @Roles('supervisor')
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

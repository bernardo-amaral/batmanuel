import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { TokenGuard } from '../auth/token.guard';
import { AnalyzeService } from './analyze.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AnalyzeUploadRequestDto } from './dto/analyze-upload-request.dto';

@ApiTags('analyze')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(TokenGuard)
export class AnalyzeController {
  constructor(private readonly analyzeService: AnalyzeService) {}

  @Post('analyze/upload')
  @UseGuards(TokenGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a zipped repository and run analysis' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['projectId', 'branch', 'commit', 'file'],
      properties: {
        projectId: { type: 'string', example: 'batmanuel' },
        branch: { type: 'string', example: 'main' },
        commit: { type: 'string', example: 'abc123' },
        file: {
          type: 'string',
          format: 'binary',
          description: 'ZIP archive containing the repository source code',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Uploaded analysis executed successfully',
  })
  analyzeUpload(
    @Body() dto: AnalyzeUploadRequestDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(
        'A ZIP file must be provided in the "file" field.',
      );
    }

    return this.analyzeService.analyzeUploadedRepository(dto, file);
  }

  @Get('projects/:id/summary')
  @ApiOperation({
    summary: 'Get historical score summary for a project (mock)',
  })
  @ApiParam({ name: 'id', example: 'sindigo-backend' })
  @ApiResponse({
    status: 200,
    description: 'Project summary retrieved successfully',
  })
  summary(@Param('id') id: string) {
    return this.analyzeService.getSummary(id);
  }
}

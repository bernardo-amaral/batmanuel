/* eslint-disable @typescript-eslint/no-unsafe-call */
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AnalyzeUploadRequestDto {
  @ApiProperty({
    example: 'my-project-service',
    description: 'Unique project identifier',
  })
  @IsString()
  projectId: string;

  @ApiProperty({ example: 'main', description: 'Git branch analyzed' })
  @IsString()
  branch: string;

  @ApiProperty({ example: 'abc123', description: 'Git commit SHA analyzed' })
  @IsString()
  commit: string;
}

/* eslint-disable @typescript-eslint/no-unsafe-call */
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateTokenDto {
  @ApiProperty({
    example: 'project-backend',
    description: 'Unique project identifier',
  })
  @IsString()
  projectId: string;
}

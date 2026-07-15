import { IsString, IsOptional } from 'class-validator';

export class AnalyzeRequestDto {
  @IsString()
  projectId: string;

  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsString()
  commit?: string;
}

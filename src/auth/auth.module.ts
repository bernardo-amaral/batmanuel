import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { TokenGuard } from './token.guard';

@Module({
  imports: [],
  controllers: [AuthController],
  providers: [TokenGuard],
  exports: [TokenGuard],
})
export class AuthModule {}

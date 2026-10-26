import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Voucher } from './entities/voucher.entity.js';
import { VouchersController } from './vouchers.controller.js';
import { VouchersService } from './vouchers.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Voucher])],
  controllers: [VouchersController],
  providers: [VouchersService],
  exports: [TypeOrmModule, VouchersService],
})
export class VouchersModule {}

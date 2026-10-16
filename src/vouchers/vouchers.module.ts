import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Voucher } from './entities/voucher.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Voucher])],
  exports: [TypeOrmModule],
})
export class VouchersModule {}

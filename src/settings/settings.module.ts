import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Setting } from './entities/setting.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Setting])],
  exports: [TypeOrmModule],
})
export class SettingsModule {}

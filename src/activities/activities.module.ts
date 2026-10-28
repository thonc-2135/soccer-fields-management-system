import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivitiesController } from './activities.controller.js';
import { ActivitiesListener } from './activities.listener.js';
import { ActivitiesService } from './activities.service.js';
import { Activity } from './entities/activity.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Activity])],
  controllers: [ActivitiesController],
  providers: [ActivitiesService, ActivitiesListener],
  exports: [TypeOrmModule],
})
export class ActivitiesModule {}

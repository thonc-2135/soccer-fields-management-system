import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Favorite } from './entities/favorite.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Favorite])],
  exports: [TypeOrmModule],
})
export class FavoritesModule {}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findById(id: number): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  /** Includes the password hash (excluded from normal selects). */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.email = :email', { email })
      .getOne();
  }

  existsByEmail(email: string): Promise<boolean> {
    return this.users.existsBy({ email });
  }

  create(
    data: Pick<User, 'name' | 'email' | 'password'> & Partial<User>,
  ): Promise<User> {
    return this.users.save(this.users.create(data));
  }
}

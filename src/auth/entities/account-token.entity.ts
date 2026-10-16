import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { AccountTokenType } from '../../common/enums/account-token-type.enum.js';
import { User } from '../../users/entities/user.entity.js';

@Entity('account_tokens')
export class AccountToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @Index({ unique: true })
  @Column({ length: 64 })
  tokenHash: string;

  @Column({
    type: 'enum',
    enum: AccountTokenType,
    enumName: 'account_token_type',
  })
  type: AccountTokenType;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

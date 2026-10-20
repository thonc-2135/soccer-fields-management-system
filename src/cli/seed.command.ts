import { Command, CommandRunner, Option } from 'nest-commander';
import { SeedService, type SeedOptions } from './seed.service.js';

@Command({
  name: 'seed',
  description: 'Seed the database with an admin account and demo data',
})
export class SeedCommand extends CommandRunner {
  constructor(private readonly seedService: SeedService) {
    super();
  }

  async run(_: string[], options: SeedOptions): Promise<void> {
    await this.seedService.run(options);
  }

  @Option({
    flags: '-f, --fresh',
    description:
      'Truncate users/fields/vouchers (and dependants) first. Not allowed in production.',
  })
  parseFresh(): boolean {
    return true;
  }

  @Option({
    flags: '-a, --admin-only',
    description: 'Only create the admin account',
  })
  parseAdminOnly(): boolean {
    return true;
  }
}

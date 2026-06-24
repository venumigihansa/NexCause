import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppSourceType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateAppDto } from './dto/create-app.dto';

@Injectable()
export class AppsService {
  constructor(private readonly prisma: PrismaService) {}

  create(createAppDto: CreateAppDto) {
    const sourceType = createAppDto.sourceType ?? AppSourceType.image;

    if (sourceType === AppSourceType.git && !createAppDto.repoUrl) {
      throw new BadRequestException('repoUrl is required for git apps');
    }

    if (createAppDto.repoUrl && !createAppDto.repoUrl.startsWith('https://')) {
      throw new BadRequestException('repoUrl must be a public HTTPS URL');
    }

    return this.prisma.app.create({
      data: {
        ...createAppDto,
        sourceType,
        branch: createAppDto.branch ?? 'main',
        buildContext: createAppDto.buildContext ?? '.',
        dockerfilePath: createAppDto.dockerfilePath ?? 'Dockerfile',
      },
    });
  }

  findAll() {
    return this.prisma.app.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string) {
    const app = await this.prisma.app.findUnique({
      where: { id },
    });

    if (!app) {
      throw new NotFoundException(`App ${id} was not found`);
    }

    return app;
  }
}

/**
 * Jest-friendly stub for PrismaService.client.
 *
 * We don't need a full in-memory Prisma — the goal of integration specs is to
 * wire real controllers + guards + pipes + services together and assert they
 * cooperate correctly. DB calls are mocked at the leaf so each test can
 * declare exactly which rows exist.
 *
 * Usage:
 *   const prisma = createPrismaStub();
 *   prisma.client.user.findUnique.mockResolvedValue(userRow);
 */

export type Mock = jest.Mock;

const crudMethods = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
] as const;

const models = [
  'user',
  'department',
  'subject',
  'course',
  'chapter',
  'lesson',
  'courseEnrollment',
  'lessonProgress',
  'quiz',
  'quizAttempt',
  'quizAnswer',
  'question',
  'certificate',
  'certificateCriteria',
  'loginLog',
  'auditLog',
  'notification',
  'systemSetting',
  'theoryContent',
  'practiceContent',
  'practiceAttempt',
  'lessonAttachment',
  'videoProgress',
  'lessonNote',
  'discussion',
  'discussionReply',
  'studentXP',
  'aiRecommendation',
  'aiChatMessage',
  'aiQuotaLog',
  'aiSuggestedQuestions',
] as const;

type ModelMock = Record<(typeof crudMethods)[number], Mock>;
type ClientMock = Record<(typeof models)[number], ModelMock> & {
  $transaction: Mock;
  $connect: Mock;
  $disconnect: Mock;
};

function buildModel(): ModelMock {
  const out = {} as ModelMock;
  for (const m of crudMethods) {
    out[m] = jest.fn();
  }
  return out;
}

export function createPrismaStub(): { client: ClientMock } {
  const client = {} as ClientMock;
  for (const model of models) {
    client[model] = buildModel();
  }
  client.$transaction = jest.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (c: ClientMock) => unknown)(client);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg;
  });
  client.$connect = jest.fn().mockResolvedValue(undefined);
  client.$disconnect = jest.fn().mockResolvedValue(undefined);
  return { client };
}

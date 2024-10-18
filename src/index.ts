import { createYoga } from 'graphql-yoga';
import { schema } from './gql';
import { CFContext, Env } from './types';

const cors = {
	credentials: true,
	methods: ['POST'],
	origin: '*',
	// Headers: ['Content-Type', 'X-Whistles-Custom-Header'],
};

const yoga = createYoga<CFContext>({
	cors,
	schema,
	context: ({ request, env }) => ({ request, env }),
});

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return yoga.fetch(request, { env });
	},
} satisfies ExportedHandler<Env>;

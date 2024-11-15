import { createSchema } from 'graphql-yoga';
import { Mutation } from './mutations';
import { Query } from './queries';

export const schema = createSchema({
	typeDefs: /* GraphQL */ `
		scalar Timestamp

		type Query {
			heartbeat: Boolean

			lookbackWindow: Int!
			pruneInterval: Int!

			numMessages: Int!
			numMessagesMarkedForPruning: Int!
			numFids: Int!
			numPartitions: Int!
			numSchemas: Int!
			maxSchemaVersion: String!
			
			isPrePermissionless(fid: Int): Boolean

			getTimestampOfEarliestMessage(secret: String, salt: String, shift: Int): Timestamp!

			getEncryptedData(limit: Int): RestingDataResponse!

			getEnabledChannels: [String!]!

			getDisabledChannels: [String!]!

			getDecryptedData(messageId: String!, bearerToken: String, secret: String, salt: String): PlaintextMessageResponse

			getDecryptedMessagesByFid(
				fid: Int!
				bearerToken: String
				limit: Int
				order: SortOrder
				secret: String
				salt: String
				shift: Int
			): DecryptedMessagesResponse!

			getDecryptedMessageByFid(
				fid: Int!
				encodedText: String!
				bearerToken: String
				secret: String
				salt: String
				shift: Int
			): PlaintextMessageResponse

			getTextByCastHash(castHash: String!, viewerFid: Int!, secret: String, salt: String, shift: Int): ClientMessageResponse
		}

		type Mutation {
			updateData(input: AuthorizedPlaintextMessage!): UpdateDataResponse!
		}

		input AuthorizedPlaintextMessage {
			fid: Int!
			timestamp: Timestamp!
			messageHash: String!
			text: String!
			hashedText: String!
			nonce: String
		}

		type UpdateDataResponse {
			success: Boolean!
			message: String
		}

		type Mutation {
			enableChannel(input: EnableChannelInput!): EnableDisableChannelResponse!
		}

		input EnableChannelInput {
			channelId: String!
			parentUrl: String!
		}

		type EnableDisableChannelResponse {
			success: Boolean!
			message: String
		}

		type Mutation {
			disableChannel(input: DisableChannelInput!): EnableDisableChannelResponse!
		}

		input DisableChannelInput {
			channelId: String!
		}

		input SortOrder {
			asc: Boolean!
		}

		type RestingDataResponse {
			rows: [RowType!]!
		}

		type RowType {
			partitionId: String!
			messageId: String!
			who: String!
			when: Timestamp!
			what: String!
			how: String!
		}

		type PlaintextMessageResponse {
			fid: Int!
			timestamp: Timestamp!
			messageHash: String!
			text: String!
		}

		type DecryptedMessagesResponse {
			messages: [PlaintextMessageResponse]!
		}

		type ClientMessageResponse {
			fid: Int!
			timestamp: Timestamp!
			castHash: String!
			text: String!
			decodedText: String
			isDecrypted: Boolean!
		}
	`,
	resolvers: { Query, Mutation },
});

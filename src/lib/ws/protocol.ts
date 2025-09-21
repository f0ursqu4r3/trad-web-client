export type Uuid = string

export const PROTOCOL_VERSION = 2

export type ClientToServerMessage = {
  client_id: Uuid
  command_id: Uuid
  payload: ClientToServerMessagePayload
}

export type ClientToServerMessagePayload =
  | {
      kind: 'System'
      data: SystemMessagePayload
    }
  | {
      kind: 'UserCommand'
      data: UserCommandPayload
    }

export type SystemMessagePayload =
  | {
      kind: 'Hello'
      data: HelloData
    }
  | {
      kind: 'Ping'
      data: PingData
    }

export type HelloData = {
  protocol_version: number
  client_name: string
  build?: string | null
  auth_token?: string | null
}

export type PingData = {
  client_send_time: number
}

export type UserCommandPayload = never // Filled in as the web UI grows.

export type ServerToClientMessage = {
  payload: ServerToClientPayload
}

export type ServerToClientPayload =
  | {
      kind: 'ClientIdAssignment'
      data: {
        new_client_id: Uuid
      }
    }
  | {
      kind: 'ServerHello'
      data: {
        protocol_version: number
        server_name: string
        build?: string | null
      }
    }
  | {
      kind: 'AuthAccepted'
      data: {
        client_id: Uuid
        token_hash?: string | null
      }
    }
  | {
      kind: 'AuthRejected'
      data: {
        reason: string
      }
    }
  | {
      kind: 'Pong'
      data: {
        server_send_time: number
      }
    }
  | {
      kind: 'ServerError'
      data: {
        error: string
      }
    }
  | {
      kind: 'FatalServerError'
      data: {
        error: string
      }
    }
  | {
      kind: string
      data: unknown
    }

export const NULL_UUID = '00000000-0000-0000-0000-000000000000'

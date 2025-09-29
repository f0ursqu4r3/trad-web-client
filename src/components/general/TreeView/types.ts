export type Id = string | number

export interface TreeItem {
  id: Id
  children?: TreeItem[]
  // Additional user data is allowed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

declare module 'virtual:fresco-assets' {
  const assets: Record<
    string,
    { content: string; type: string; binary: boolean; etag: string }
  >;
  export default assets;
}

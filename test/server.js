import StaticServer from 'static-server';

export class Server {
  /**
   * @type {StaticServer}
   */
  #server;

  start() {
    this.#server = new StaticServer({
      rootPath: `${process.cwd()}/test/res`,
      port: 8000,
    });
    return new Promise((resolve) => {
      this.#server.start(() => {
        process.stderr.write('Server started\n');
        resolve();
      });
    });
  }

  stop() {
    this.#server.stop();
  }
}

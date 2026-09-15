interface StartupBannerParams {
  appName: string;
  version: string;
}

export function printStartupBanner(params: StartupBannerParams): void {
  const banner = `
██████╗  █████╗ ████████╗███╗   ███╗ █████╗ ███╗   ██╗██╗   ██╗███████╗██╗
██╔══██╗██╔══██╗╚══██╔══╝████╗ ████║██╔══██╗████╗  ██║██║   ██║██╔════╝██║
██████╔╝███████║   ██║   ██╔████╔██║███████║██╔██╗ ██║██║   ██║█████╗  ██║
██╔══██╗██╔══██║   ██║   ██║╚██╔╝██║██╔══██║██║╚██╗██║██║   ██║██╔══╝  ██║
██████╔╝██║  ██║   ██║   ██║ ╚═╝ ██║██║  ██║██║ ╚████║╚██████╔╝███████╗███████╗
╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚══════╝

Application : ${params.appName}
Version     : ${params.version}
Author      : Bernardo Amaral
Mode        : CLI
`;

  console.error(banner);
}

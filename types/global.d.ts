declare global {
  interface Window {
    gapi: {
      load: (api: string, callback: () => void) => void;
      client: {
        init: (config: { discoveryDocs: string[] }) => Promise<void>;
        setToken: (token: { access_token: string }) => void;
        sheets: {
          spreadsheets: {
            get: (params: {
              spreadsheetId: string;
              includeGridData?: boolean;
            }) => Promise<{
              result: {
                sheets?: Array<{ properties?: { title?: string } }>;
              };
            }>;
            values: {
              get: (params: {
                spreadsheetId: string;
                range: string;
                valueRenderOption?: string;
              }) => Promise<{
                result: { values?: string[][] };
              }>;
            };
          };
        };
      };
    };
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
      visualization: {
        arrayToDataTable: (data: any[][]) => any;
        PieChart: new (element: HTMLElement) => any;
        BarChart: new (element: HTMLElement) => any;
      };
      charts: {
        load: (version: string, config: { packages: string[] }) => void;
        setOnLoadCallback: (callback: () => void) => void;
      };
    };
  }
}

// Declarar módulo html2canvas
declare module 'html2canvas' {
  interface Html2CanvasOptions {
    scale?: number;
    backgroundColor?: string;
    logging?: boolean;
  }

  function html2canvas(
    element: HTMLElement,
    options?: Html2CanvasOptions
  ): Promise<HTMLCanvasElement>;

  export default html2canvas;
}

export {};
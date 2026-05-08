/**
 * Report Generator
 *
 * BacktestResult → Markdown 리포트 + JSON 요약
 * CLI 실행 후 reports/ 디렉토리에 저장.
 */
import type { BacktestResult } from "./types";
export declare function generateMarkdownReport(result: BacktestResult): string;
export declare function saveReport(result: BacktestResult, outputDir?: string): {
    mdPath: string;
    jsonPath: string;
};

import Account from "@/account";
import ObjectToSellEntry from "@/extensions/bid/ObjectToSellEntry";
import { isBlank } from "@/utils/String";
import { remote } from "electron";
import * as fs from "fs";
import { List } from "linqts";
import * as path from "path";

interface IBidConfigurationJSON {
  interval: number;
  scriptPath: string;
  objectsToSell: ObjectToSellEntry[];
}

export default class BidConfiguration {

  public readonly configurationsPath = "parameters/bid";

  public interval: number;
  public scriptPath: string;
  public objectsToSell: List<ObjectToSellEntry>;

  get isScriptPathValid(): boolean {
    return !isBlank(this.scriptPath);
  }

  private account: Account;
  private configFilePath = "";

  constructor(account: Account) {
    this.account = account;
    this.interval = 10;
    this.objectsToSell = new List();
  }

  public setConfigFilePath() {
    const folderPath = path.join(remote.app.getPath("userData"), this.configurationsPath);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath);
    }
    this.configFilePath = path.join(folderPath, `${this.account.accountConfig.username}_${this.account.game.character.name}.config`);
  }

  public load() {
    if (!fs.existsSync(this.configFilePath)) {
      return;
    }
    const data = fs.readFileSync(this.configFilePath);
    const json = JSON.parse(data.toString()) as IBidConfigurationJSON;
    this.interval = json.interval;
    this.scriptPath = json.scriptPath;
    this.objectsToSell = new List(json.objectsToSell);
  }

  public save() {
    const toSave: IBidConfigurationJSON = {
      interval: this.interval,
      objectsToSell: this.objectsToSell.ToArray(),
      scriptPath: this.scriptPath,
    };
    fs.writeFileSync(this.configFilePath, JSON.stringify(toSave));
  }
}

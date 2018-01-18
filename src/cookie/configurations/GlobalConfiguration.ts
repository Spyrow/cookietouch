import AccountConfiguration from "@/configurations/accounts/AccountConfiguration";
import { Languages } from "@/configurations/language/Languages";
import Crypto from "@/utils/Crypto";
import { remote } from "electron";
import * as fs from "fs";
import { List } from "linqts";
import * as path from "path";

interface IGlobalConfigurationJSON {
  anticaptchaKey: string;
  lang: Languages;
  accounts: AccountConfiguration[];
  showDebugMessages: boolean;
}

export default class GlobalConfiguration {
  public static set anticaptchaKey(key: string) {
    this._anticaptchaKey = key;
    this.save();
  }

  public static get anticaptchaKey(): string {
    return this._anticaptchaKey;
  }

  public static set lang(lang: Languages) {
    this._lang = lang;
    this.save();
  }

  public static get lang(): Languages {
    return this._lang;
  }

  public static set showDebugMessages(show: boolean) {
    this._showDebugMessages = show;
    this.save();
  }

  public static get showDebugMessages(): boolean {
    return this._showDebugMessages;
  }

  public static addAccountAndSave(username: string, password: string, server: string, character: string) {
    this._accounts.Add(new AccountConfiguration(username, password, server, character));
    this.save();
  }

  public static addAccountsAndSave(accounts: List<AccountConfiguration>) {
    accounts.ForEach((account) => {
      this._accounts.Add(account);
    });
    this.save();
  }

  public static removeAccount(accountConfig: AccountConfiguration) {
    this._accounts.Remove(accountConfig);
  }

  public static getAccount(username: string): AccountConfiguration {
    return this._accounts.FirstOrDefault((a) => a.username === username);
  }

  public static load() {
    if (!fs.existsSync(this.configPath)) {
      return;
    }
    const data = fs.readFileSync(this.configPath);
    const decrypted = Crypto.decrypt(data.toString(), "c0oKïeT0uCh");
    const json = JSON.parse(decrypted) as IGlobalConfigurationJSON;
    this._accounts = new List(json.accounts);
    this._anticaptchaKey = json.anticaptchaKey;
    this._lang = json.lang;
    this._showDebugMessages = json.showDebugMessages;
  }

  public static save() {
    const toSave: IGlobalConfigurationJSON = {
      accounts: this._accounts.ToArray(),
      anticaptchaKey: this._anticaptchaKey,
      lang: this._lang,
      showDebugMessages: this._showDebugMessages,
    };
    const crypted = Crypto.encrypt(JSON.stringify(toSave), "c0oKïeT0uCh");
    fs.writeFileSync(this.configPath, crypted);
  }

  private static configPath = path.join(remote.app.getPath("userData"), "config.cookie");
  private static _anticaptchaKey: string = "";
  private static _lang: Languages = Languages.ENGLISH;
  private static _accounts = new List<AccountConfiguration>();
  private static _showDebugMessages = true;
}
import Account from "@/account";
import { AccountStates } from "@/account/AccountStates";
import LiteEvent from "@/utils/LiteEvent";
import ExchangeObjectAddedMessage from "@/protocol/network/messages/ExchangeObjectAddedMessage";
import ObjectEntry from "@/game/character/inventory/ObjectEntry";


export default class Craft {

  constructor(account: Account) {
    this.account = account;

    this.remoteObjects = [];
    this.objects = [];
  }
  public remoteObjects: ObjectEntry[];
  public objects: ObjectEntry[];
  public remoteCurrentWeight: number = 0;
  public currentWeight: number = 0;
  private account: Account;
  private readonly onExchangeContentChanged = new LiteEvent<void>();
  public setRecipe(guid: number): boolean {
    this.account.network.sendMessageFree("ExchangeSetCraftRecipeMessage", {
      objectGID: guid,

    });
    return true;
  }

  public ready(): boolean {
    this.account.network.sendMessageFree("ExchangeReadyMessage", {
      ready: true,
      step: 2
    });
    return true;
  }

  public async UpdateExchangeObjectAddedMessage(
    message: ExchangeObjectAddedMessage
  ) {
    const newObj = await ObjectEntry.setup(message.object);
    if (message.remote) {
      this.remoteObjects.push(newObj);
      this.remoteCurrentWeight += newObj.realWeight * newObj.quantity;
    } else {
      this.objects.push(newObj);
      this.currentWeight += newObj.realWeight * newObj.quantity;
    }

    this.onExchangeContentChanged.trigger();
  }

}
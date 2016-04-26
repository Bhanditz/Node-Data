import * as RM from './rolemodel';
import {onetomany, manytoone, manytomany, jsonignore, required} from '../../core/decorators';
import {field, document} from '../../mongoose/decorators'; import {IUser} from './user';
import {Types} from 'mongoose';
import {Strict} from '../../mongoose/enums/';
import {RoleModel} from './rolemodel';
import {JsonIgnore} from '../../core/enums/jsonignore-enum';

@document({ name: 'users', strict: Strict.false })
export class UserModel {
    @field({ primary: true, autogenerated: true })
    _id: Types.ObjectId;

    @field()
    name: String;

    @field({ itemType: String})
    courses: Array<String>;

    @field()
    @required()
    email: String;

    @field()
    accessToken: String;

    @field()
    refreshToken: String;

    @field()
    password: String;

    @field()
    @jsonignore()
    age: String;

    @onetomany({ rel: 'roles', itemType: RoleModel, embedded: true, persist: true, eagerLoading: true })
    roles: Array<RoleModel>;
}

export default UserModel;